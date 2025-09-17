import { z } from 'zod';

export const FileChangeSchema = z.object({
  file: z.string(),
  before: z.string(),
  after: z.string()
});

export const RenameJsxTagArgs = z.object({
  file: z.string(),
  fromName: z.string(),
  toName: z.string()
});

export const RemoveJsxPropArgs = z.object({
  file: z.string(),
  tagName: z.string(),
  propName: z.string()
});

export const ConvertComponentPropToElementArgs = z.object({
  file: z.string(),
  tagName: z.string(),
  fromPropName: z.string(),
  toPropName: z.string()
});

export const EditImportRenameArgs = z.object({
  file: z.string(),
  moduleName: z.string(),
  fromName: z.string(),
  toName: z.string()
});

export type FileChange = z.infer<typeof FileChangeSchema>;
export type RenameJsxTagArgs = z.infer<typeof RenameJsxTagArgs>;
export type RemoveJsxPropArgs = z.infer<typeof RemoveJsxPropArgs>;
export type ConvertComponentPropToElementArgs = z.infer<typeof ConvertComponentPropToElementArgs>;
export type EditImportRenameArgs = z.infer<typeof EditImportRenameArgs>;


