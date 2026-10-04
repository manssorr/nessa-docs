import type { CatalogResponse, DocumentResponse, SearchResponse, UnknownDocumentResponse } from '../../shared/api';
import type { ProjectOutcome, FolderPickOutcome, FolderPickerStatus } from '../../shared/projects';

export type Fetched<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'unknown-document'; readonly value: UnknownDocumentResponse }
  | { readonly kind: 'failed'; readonly message: string };

export interface ProjectReads {
  catalog(signal?: AbortSignal): Promise<Fetched<CatalogResponse>>;
  document(id: string, signal?: AbortSignal): Promise<Fetched<DocumentResponse>>;
  search(query: string, signal?: AbortSignal): Promise<Fetched<SearchResponse>>;
}
export interface ProjectSource {
  current(id: string | null, signal?: AbortSignal): Promise<ProjectOutcome>;
  open(input: { readonly path: string } | { readonly example: true }, signal?: AbortSignal): Promise<ProjectOutcome>;
  reads(id: string): ProjectReads;
  pickerStatus(signal?: AbortSignal): Promise<FolderPickerStatus>;
  chooseFolder(signal?: AbortSignal): Promise<FolderPickOutcome>;
}
