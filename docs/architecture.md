# Package boundaries

Nessa Docs keeps authored Markdown in the user's project. The separate local
website reads it and renders diagrams. It has no dependency on the Nessa agent
backend and does not execute the described state machines.

## Owners

| Area | Owns |
| --- | --- |
| `skills/nessa-docs/` | Agent instructions and the repository document format |
| `shared/` | Markdown structure and API data types shared by reader and server |
| `server/document.ts`, `catalog.ts`, `diagram-details.ts` | Metadata, hierarchy and target validation |
| `server/files.ts` | Local filesystem adapter for the injected repository-files port |
| `server/project-opening/` | Validate chosen folders, retain opened project contexts, supply the local folder chooser, and compose the headless checker |
| `server/http.ts`, `main.ts` | Local HTTP transport and process composition |
| `src/project-opening/read-port.ts` | Framework-independent project source, read contract and outcomes |
| Other `src/project-opening/` files | Welcome flow and React read-context wiring |
| `src/api.ts` | Local HTTP implementation of the reader's project port |
| Remaining `src/` | Browsing, Markdown presentation, diagram canvas, inspector and settings |
| `vendor/nessa-ui/` | The small licensed UI subset; provenance in THIRD_PARTY_NOTICES |
| `examples/store/` | A small source-backed documentation example |
| `fixtures/` | Controlled projects used to verify supported and refused content |
| `scripts/development/` | Vite's local proxy adapter, using the server's request-admission rule |
| `verification/` | Real browser journeys and measurements |

Opening a folder creates a project handle. The URL selects that handle and the
frontend supplies it to its read port. Project state is scoped to that context;
the Markdown renderer and Mermaid canvas do not select filesystem roots. A host
integration can replace the opening adapter while keeping the reader contract.

The initial local adapter targets macOS and Linux. Repository-relative Markdown
paths use `/`. Native Windows support needs its physical-path and filesystem
behavior handled separately, rather than changing the Markdown path contract.

Folder selection belongs to the project-opening adapter. The macOS adapter opens
the native chooser; other supported hosts use path entry for now. Selecting a
folder fills the field. Catalog validation remains the owner of opening it.
A future host supplies its own chooser without changing Markdown rendering.

The format reference inside the skill is the documentation owner of metadata.
The parser is its implementation. Other guides link the reference instead of
declaring another schema. `parent` metadata owns hierarchy; a separate manifest
would create another navigation authority.

Mermaid rendering runs serially because the library keeps global state.
The canvas handles navigation and presentation after SVG rendering. Markdown
bindings, rather than inferred labels, decide which element has depth.

## Next adapter: Codex

The current deliverable is a local web app and an installable agent skill.
A future Codex integration can reuse the document parser, catalog and renderer,
and supply a project through a host adapter. Filesystem access and project
selection belong in that adapter, outside the renderer. Browser onboarding must
not be a dependency of Markdown parsing or diagram rendering.

No extension manifest, workspace bridge, agent-launch endpoint or generated
documentation write API is shipped in this pass. Those require an actual host
contract and their own validation when the integration is built.
