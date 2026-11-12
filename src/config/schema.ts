import { z } from "zod";

const stringList = z.array(z.string());

export const easyInnoSchema = z
  .object({
    entry: z.string().min(1).optional(),
    applicationType: z.enum(["console", "windowed"]).optional(),
    build: z
      .object({
        command: z.string().nullable().optional(),
        dependencyCommand: z.string().min(1).optional(),
        include: stringList.optional(),
        exclude: stringList.optional(),
      })
      .strict()
      .optional(),
    runtime: z
      .object({
        version: z.string().optional(),
        architecture: z.string().optional(),
        nodeArguments: stringList.optional(),
        applicationArguments: stringList.optional(),
        environment: z.record(z.string(), z.string()).optional(),
      })
      .strict()
      .optional(),
    launcher: z
      .object({
        workingDirectory: z.string().optional(),
        forwardArguments: z.boolean().optional(),
        waitForExit: z.boolean().optional(),
        showConsole: z.boolean().optional(),
      })
      .strict()
      .optional(),
    installer: z
      .object({
        appId: z.string().min(1).optional(),
        outputDirectory: z.string().min(1).optional(),
        outputName: z.string().min(1).optional(),
        installMode: z.enum(["perUser", "perMachine"]).optional(),
        icon: z.string().optional(),
        startMenuShortcut: z.boolean().optional(),
        desktopShortcut: z.boolean().optional(),
        launchAfterInstall: z.boolean().optional(),
        allowChangeInstallDirectory: z.boolean().optional(),
        compression: z.string().min(1).optional(),
        solidCompression: z.boolean().optional(),
      })
      .strict()
      .optional(),
    advanced: z
      .object({
        keepStaging: z.boolean().optional(),
        keepIss: z.boolean().optional(),
        additionalInnoDirectives: z.record(z.string(), z.string()).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type EasyInnoUserConfig = z.infer<typeof easyInnoSchema>;
