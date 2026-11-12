/*
 * easy-inno launcher
 *
 * Reads easy-inno.runtime.json next to the executable and starts
 *   <install>\runtime\node.exe [nodeArguments] <install>\<entry> [applicationArguments] [forwarded args]
 *
 * Build (see scripts/build-launcher.mjs):
 *   console  : subsystem console, entry point wmain
 *   windowed : -DWINDOWED, subsystem windows, entry point wWinMain (no console window)
 *
 * All Win32 calls use the wide-character API so that non-ASCII (e.g. Chinese) paths work.
 */
#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#include <windows.h>
#include <shellapi.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>

/* ------------------------------------------------------------------ JSON */

typedef enum { J_NULL, J_BOOL, J_NUM, J_STR, J_ARR, J_OBJ } JType;

typedef struct JNode {
    JType type;
    int boolean;
    wchar_t *str;          /* J_STR */
    wchar_t **keys;        /* J_OBJ */
    struct JNode **items;  /* J_ARR values / J_OBJ values */
    size_t count;
} JNode;

static void *xalloc(size_t n) {
    void *p = calloc(1, n ? n : 1);
    if (!p) ExitProcess(70);
    return p;
}

static const char *skip_ws(const char *s) {
    while (*s == ' ' || *s == '\t' || *s == '\r' || *s == '\n') s++;
    return s;
}

static int hex4(const char *s, unsigned *out) {
    unsigned v = 0;
    for (int i = 0; i < 4; i++) {
        char c = s[i];
        v <<= 4;
        if (c >= '0' && c <= '9') v |= (unsigned)(c - '0');
        else if (c >= 'a' && c <= 'f') v |= (unsigned)(c - 'a' + 10);
        else if (c >= 'A' && c <= 'F') v |= (unsigned)(c - 'A' + 10);
        else return 0;
    }
    *out = v;
    return 1;
}

/* Parses a JSON string at *p (pointing at the opening quote) into a wide string. */
static wchar_t *parse_string(const char **p) {
    const char *s = *p + 1;
    size_t cap = 16, len = 0;
    char *buf = (char *)xalloc(cap);
    while (*s && *s != '"') {
        char out[4];
        int n = 0;
        if (*s == '\\') {
            s++;
            switch (*s) {
                case 'n': out[n++] = '\n'; break;
                case 'r': out[n++] = '\r'; break;
                case 't': out[n++] = '\t'; break;
                case 'b': out[n++] = '\b'; break;
                case 'f': out[n++] = '\f'; break;
                case 'u': {
                    unsigned cp;
                    if (!hex4(s + 1, &cp)) return NULL;
                    s += 4;
                    if (cp >= 0xD800 && cp <= 0xDBFF && s[1] == '\\' && s[2] == 'u') {
                        unsigned lo;
                        if (hex4(s + 3, &lo) && lo >= 0xDC00 && lo <= 0xDFFF) {
                            cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
                            s += 6;
                        }
                    }
                    if (cp < 0x80) out[n++] = (char)cp;
                    else if (cp < 0x800) { out[n++] = (char)(0xC0 | (cp >> 6)); out[n++] = (char)(0x80 | (cp & 0x3F)); }
                    else if (cp < 0x10000) { out[n++] = (char)(0xE0 | (cp >> 12)); out[n++] = (char)(0x80 | ((cp >> 6) & 0x3F)); out[n++] = (char)(0x80 | (cp & 0x3F)); }
                    else { out[n++] = (char)(0xF0 | (cp >> 18)); out[n++] = (char)(0x80 | ((cp >> 12) & 0x3F)); out[n++] = (char)(0x80 | ((cp >> 6) & 0x3F)); out[n++] = (char)(0x80 | (cp & 0x3F)); }
                    break;
                }
                default: out[n++] = *s; break; /* \" \\ \/ */
            }
            s++;
        } else {
            out[n++] = *s++;
        }
        if (len + (size_t)n + 1 > cap) {
            cap = (len + (size_t)n + 1) * 2;
            char *nb = (char *)xalloc(cap);
            memcpy(nb, buf, len);
            free(buf);
            buf = nb;
        }
        memcpy(buf + len, out, (size_t)n);
        len += (size_t)n;
    }
    if (*s != '"') return NULL;
    buf[len] = 0;
    *p = s + 1;
    int wlen = MultiByteToWideChar(CP_UTF8, 0, buf, -1, NULL, 0);
    wchar_t *w = (wchar_t *)xalloc(sizeof(wchar_t) * (size_t)(wlen + 1));
    MultiByteToWideChar(CP_UTF8, 0, buf, -1, w, wlen);
    free(buf);
    return w;
}

static void push(JNode *n, wchar_t *key, JNode *val) {
    n->items = (JNode **)realloc(n->items, sizeof(JNode *) * (n->count + 1));
    if (n->type == J_OBJ) n->keys = (wchar_t **)realloc(n->keys, sizeof(wchar_t *) * (n->count + 1));
    if (!n->items || (n->type == J_OBJ && !n->keys)) ExitProcess(70);
    if (n->type == J_OBJ) n->keys[n->count] = key;
    n->items[n->count++] = val;
}

static JNode *parse_value(const char **p) {
    const char *s = skip_ws(*p);
    JNode *n = (JNode *)xalloc(sizeof(JNode));
    if (*s == '"') {
        n->type = J_STR;
        n->str = parse_string(&s);
        if (!n->str) return NULL;
    } else if (*s == '{' || *s == '[') {
        char close = *s == '{' ? '}' : ']';
        n->type = *s == '{' ? J_OBJ : J_ARR;
        s = skip_ws(s + 1);
        while (*s && *s != close) {
            wchar_t *key = NULL;
            if (n->type == J_OBJ) {
                if (*s != '"') return NULL;
                key = parse_string(&s);
                if (!key) return NULL;
                s = skip_ws(s);
                if (*s != ':') return NULL;
                s++;
            }
            JNode *v = parse_value(&s);
            if (!v) return NULL;
            push(n, key, v);
            s = skip_ws(s);
            if (*s == ',') s = skip_ws(s + 1);
        }
        if (*s != close) return NULL;
        s++;
    } else if (strncmp(s, "true", 4) == 0) {
        n->type = J_BOOL; n->boolean = 1; s += 4;
    } else if (strncmp(s, "false", 5) == 0) {
        n->type = J_BOOL; n->boolean = 0; s += 5;
    } else if (strncmp(s, "null", 4) == 0) {
        n->type = J_NULL; s += 4;
    } else if (*s == '-' || (*s >= '0' && *s <= '9')) {
        n->type = J_NUM;
        while (*s == '-' || *s == '+' || *s == '.' || *s == 'e' || *s == 'E' || (*s >= '0' && *s <= '9')) s++;
    } else {
        return NULL;
    }
    *p = s;
    return n;
}

static JNode *get(const JNode *obj, const wchar_t *key) {
    if (!obj || obj->type != J_OBJ) return NULL;
    for (size_t i = 0; i < obj->count; i++)
        if (wcscmp(obj->keys[i], key) == 0) return obj->items[i];
    return NULL;
}

static const wchar_t *get_str(const JNode *obj, const wchar_t *key, const wchar_t *fallback) {
    JNode *n = get(obj, key);
    return n && n->type == J_STR ? n->str : fallback;
}

static int get_bool(const JNode *obj, const wchar_t *key, int fallback) {
    JNode *n = get(obj, key);
    return n && n->type == J_BOOL ? n->boolean : fallback;
}

/* ---------------------------------------------------------------- helpers */

static int g_windowed =
#ifdef WINDOWED
    1;
#else
    0;
#endif

static void fail(const wchar_t *fmt, const wchar_t *detail) {
    wchar_t msg[2048];
    _snwprintf(msg, 2047, fmt, detail ? detail : L"");
    msg[2047] = 0;
    if (g_windowed) MessageBoxW(NULL, msg, L"easy-inno launcher", MB_OK | MB_ICONERROR);
    else fwprintf(stderr, L"easy-inno launcher: %ls\n", msg);
}

static wchar_t *join_path(const wchar_t *dir, const wchar_t *rel) {
    size_t n = wcslen(dir) + wcslen(rel) + 2;
    wchar_t *out = (wchar_t *)xalloc(n * sizeof(wchar_t));
    wcscpy(out, dir);
    size_t l = wcslen(out);
    if (l && out[l - 1] != L'\\') wcscat(out, L"\\");
    wcscat(out, rel);
    for (wchar_t *c = out; *c; c++) if (*c == L'/') *c = L'\\';
    return out;
}

static int file_exists(const wchar_t *p) {
    DWORD a = GetFileAttributesW(p);
    return a != INVALID_FILE_ATTRIBUTES && !(a & FILE_ATTRIBUTE_DIRECTORY);
}

/* Appends one argument to a command line using the MSVCRT quoting rules. */
static void append_arg(wchar_t **cmd, size_t *len, size_t *cap, const wchar_t *arg) {
    size_t need = wcslen(arg) * 2 + 4 + *len;
    if (need > *cap) {
        *cap = need * 2;
        wchar_t *nb = (wchar_t *)xalloc(*cap * sizeof(wchar_t));
        if (*cmd) memcpy(nb, *cmd, (*len + 1) * sizeof(wchar_t));
        free(*cmd);
        *cmd = nb;
    }
    wchar_t *o = *cmd + *len;
    if (*len) *o++ = L' ';
    int quote = *arg == 0 || wcspbrk(arg, L" \t\n\v\"") != NULL;
    if (quote) *o++ = L'"';
    for (const wchar_t *a = arg;; a++) {
        size_t bs = 0;
        while (*a == L'\\') { a++; bs++; }
        if (*a == 0) {
            for (size_t i = 0; i < bs * (quote ? 2 : 1); i++) *o++ = L'\\';
            break;
        } else if (*a == L'"') {
            for (size_t i = 0; i < bs * 2 + 1; i++) *o++ = L'\\';
            *o++ = L'"';
        } else {
            for (size_t i = 0; i < bs; i++) *o++ = L'\\';
            *o++ = *a;
        }
    }
    if (quote) *o++ = L'"';
    *o = 0;
    *len = (size_t)(o - *cmd);
}

static BOOL WINAPI ctrl_handler(DWORD type) {
    /* The child receives Ctrl+C from the shared console; the launcher keeps waiting. */
    (void)type;
    return TRUE;
}

/* ------------------------------------------------------------------- main */

static int launch(int argc, wchar_t **argv) {
    wchar_t self[MAX_PATH * 4];
    DWORD n = GetModuleFileNameW(NULL, self, (DWORD)(sizeof(self) / sizeof(self[0])));
    if (n == 0 || n >= sizeof(self) / sizeof(self[0])) { fail(L"Cannot determine the launcher path.", NULL); return 1; }
    wchar_t *installDir = _wcsdup(self);
    wchar_t *slash = wcsrchr(installDir, L'\\');
    if (slash) *slash = 0;

    wchar_t *configPath = join_path(installDir, L"easy-inno.runtime.json");
    HANDLE h = CreateFileW(configPath, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    if (h == INVALID_HANDLE_VALUE) { fail(L"Missing configuration file:\n%ls", configPath); return 1; }
    DWORD size = GetFileSize(h, NULL), read = 0;
    char *json = (char *)xalloc(size + 1);
    ReadFile(h, json, size, &read, NULL);
    CloseHandle(h);
    json[read] = 0;
    const char *cursor = json;
    if ((unsigned char)cursor[0] == 0xEF && (unsigned char)cursor[1] == 0xBB && (unsigned char)cursor[2] == 0xBF) cursor += 3;
    JNode *cfg = parse_value(&cursor);
    if (!cfg || cfg->type != J_OBJ) { fail(L"Invalid configuration file:\n%ls", configPath); return 1; }

    wchar_t *runtime = join_path(installDir, get_str(cfg, L"runtime", L"runtime\\node.exe"));
    wchar_t *entry = join_path(installDir, get_str(cfg, L"entry", L"app\\index.js"));
    wchar_t *workDir = join_path(installDir, get_str(cfg, L"workingDirectory", L"app"));
    const wchar_t *appVersion = get_str(cfg, L"appVersion", L"");
    const wchar_t *dataDirName = get_str(cfg, L"dataDirName", L"easy-inno-app");

    if (!file_exists(runtime)) { fail(L"Node.js runtime not found:\n%ls", runtime); return 1; }
    if (!file_exists(entry)) { fail(L"Application entry not found:\n%ls", entry); return 1; }

    int healthCheck = 0;
    int forwardStart = 1;
    if (argc > 1 && wcscmp(argv[1], L"--easy-inno-health-check") == 0) { healthCheck = 1; forwardStart = 2; }

    /* Environment */
    wchar_t localAppData[MAX_PATH * 2] = L"";
    GetEnvironmentVariableW(L"LOCALAPPDATA", localAppData, MAX_PATH * 2);
    wchar_t *dataDir = join_path(localAppData[0] ? localAppData : installDir, dataDirName);
    CreateDirectoryW(dataDir, NULL);
    SetEnvironmentVariableW(L"EASY_INNO_INSTALL_DIR", installDir);
    SetEnvironmentVariableW(L"EASY_INNO_APP_DIR", workDir);
    wchar_t *runtimeDir = _wcsdup(runtime);
    wchar_t *rs = wcsrchr(runtimeDir, L'\\');
    if (rs) *rs = 0;
    SetEnvironmentVariableW(L"EASY_INNO_RUNTIME_DIR", runtimeDir);
    SetEnvironmentVariableW(L"EASY_INNO_DATA_DIR", dataDir);
    SetEnvironmentVariableW(L"EASY_INNO_APP_VERSION", appVersion);
    JNode *env = get(cfg, L"environment");
    if (env && env->type == J_OBJ)
        for (size_t i = 0; i < env->count; i++)
            if (env->items[i]->type == J_STR) SetEnvironmentVariableW(env->keys[i], env->items[i]->str);

    /* Command line */
    wchar_t *cmd = NULL;
    size_t len = 0, cap = 0;
    append_arg(&cmd, &len, &cap, runtime);
    if (healthCheck) {
        append_arg(&cmd, &len, &cap, L"-e");
        append_arg(&cmd, &len, &cap, L"process.exit(0)");
    } else {
        JNode *nodeArgs = get(cfg, L"nodeArguments");
        if (nodeArgs && nodeArgs->type == J_ARR)
            for (size_t i = 0; i < nodeArgs->count; i++)
                if (nodeArgs->items[i]->type == J_STR) append_arg(&cmd, &len, &cap, nodeArgs->items[i]->str);
        append_arg(&cmd, &len, &cap, entry);
        JNode *appArgs = get(cfg, L"applicationArguments");
        if (appArgs && appArgs->type == J_ARR)
            for (size_t i = 0; i < appArgs->count; i++)
                if (appArgs->items[i]->type == J_STR) append_arg(&cmd, &len, &cap, appArgs->items[i]->str);
        if (get_bool(cfg, L"forwardArguments", 1))
            for (int i = forwardStart; i < argc; i++) append_arg(&cmd, &len, &cap, argv[i]);
    }

    int wait = healthCheck ? 1 : get_bool(cfg, L"waitForExit", 1);
    int showConsole = g_windowed ? 0 : get_bool(cfg, L"showConsole", 1);

    STARTUPINFOW si;
    PROCESS_INFORMATION pi;
    ZeroMemory(&si, sizeof(si));
    ZeroMemory(&pi, sizeof(pi));
    si.cb = sizeof(si);
    DWORD flags = CREATE_UNICODE_ENVIRONMENT | (showConsole ? 0 : CREATE_NO_WINDOW);

    SetConsoleCtrlHandler(ctrl_handler, TRUE);
    if (!CreateProcessW(runtime, cmd, NULL, NULL, TRUE, flags, NULL, workDir, &si, &pi)) {
        fail(L"Failed to start Node.js runtime:\n%ls", runtime);
        return 1;
    }
    CloseHandle(pi.hThread);
    DWORD code = 0;
    if (wait) {
        WaitForSingleObject(pi.hProcess, INFINITE);
        GetExitCodeProcess(pi.hProcess, &code);
    }
    CloseHandle(pi.hProcess);
    if (healthCheck && !g_windowed) wprintf(code == 0 ? L"easy-inno health check: ok\n" : L"easy-inno health check: failed\n");
    return (int)code;
}

#ifdef WINDOWED
int WINAPI wWinMain(HINSTANCE inst, HINSTANCE prev, PWSTR cmdline, int show) {
    (void)inst; (void)prev; (void)cmdline; (void)show;
    int argc = 0;
    wchar_t **argv = CommandLineToArgvW(GetCommandLineW(), &argc);
    return launch(argc, argv);
}
#else
int wmain(int argc, wchar_t **argv) {
    return launch(argc, argv);
}
#endif
