# Migration Plan: Next.js → .NET Blazor WebAssembly

## Overview

Rask is a RabbitMQ management UI currently built with Next.js 16, React 19, TanStack Query, shadcn/ui, and SQLite. The application proxies all requests to the RabbitMQ Management HTTP API through server-side API routes and uses AMQP (amqplib) for real-time message tracing.

This plan migrates to a **.NET 9 Blazor WebAssembly** hosted solution, where:
- **Blazor WASM** runs in the browser (replaces React)
- **ASP.NET Core** host serves the WASM app and provides the API proxy layer (replaces Next.js API routes)
- **EF Core + SQLite** replaces better-sqlite3 for environment/settings storage
- **RabbitMQ.Client** replaces amqplib for AMQP tracing

---

## Phase 0: Project Scaffolding

### 0.1 Create Solution Structure

```
rask/
├── Rask.sln
├── src/
│   ├── Rask.Client/              # Blazor WASM project
│   │   ├── Pages/                # Routable page components
│   │   ├── Components/           # Reusable Razor components
│   │   ├── Layout/               # MainLayout, NavMenu, Header
│   │   ├── Services/             # HttpClient wrappers, state
│   │   ├── Models/               # Shared DTOs (from Rask.Shared)
│   │   ├── wwwroot/              # Static assets, CSS
│   │   └── Program.cs
│   ├── Rask.Server/              # ASP.NET Core host
│   │   ├── Controllers/          # API proxy controllers
│   │   ├── Services/             # RabbitMQ client, storage, AMQP
│   │   ├── Data/                 # EF Core DbContext, migrations
│   │   ├── Hubs/                 # SignalR hub (replaces SSE)
│   │   └── Program.cs
│   └── Rask.Shared/              # Shared models/DTOs
│       └── Models/
├── tests/
│   ├── Rask.Server.Tests/        # xUnit server tests
│   └── Rask.Client.Tests/        # bUnit client tests
├── Dockerfile
└── docker-compose.yml
```

### 0.2 Initialize Projects

```bash
dotnet new blazorwasm-empty --hosted -n Rask -o rask
```

- Target: .NET 9
- Use the `--hosted` template to get Client + Server + Shared projects
- Add NuGet packages (see Phase 1)

### 0.3 NuGet Dependencies

**Rask.Server:**
| Package | Replaces |
|---|---|
| `Microsoft.EntityFrameworkCore.Sqlite` | `better-sqlite3` |
| `RabbitMQ.Client` (7.x) | `amqplib` |
| `Microsoft.AspNetCore.SignalR` | EventSource SSE |
| `System.Security.Cryptography` | Custom AES-256-GCM encryption (built-in) |

**Rask.Client:**
| Package | Replaces |
|---|---|
| `Microsoft.AspNetCore.Components.WebAssembly` | React |
| `MudBlazor` or `Radzen.Blazor` | shadcn/ui + Radix |
| `Blazor.Diagrams` | `@xyflow/react` + `dagre` |

**Rask.Shared:**
- No external deps — just plain C# record/class DTOs

---

## Phase 1: Data Models (Rask.Shared)

Port `/lib/types.ts` to C# records in `Rask.Shared/Models/`.

### Type Mappings

| TypeScript | C# |
|---|---|
| `Overview` | `record Overview(...)` |
| `Queue` | `record RabbitQueue(...)` |
| `Exchange` | `record RabbitExchange(...)` |
| `Binding` | `record RabbitBinding(...)` |
| `Connection` | `record RabbitConnection(...)` |
| `Channel` | `record RabbitChannel(...)` |
| `Vhost` | `record RabbitVhost(...)` |
| `RabbitUser` | `record RabbitUser(...)` |
| `VhostPermission` | `record VhostPermission(...)` |
| `Policy` | `record RabbitPolicy(...)` |
| `VhostLimit` | `record VhostLimit(...)` |
| `GlobalParameter` | `record GlobalParameter(...)` |
| `FeatureFlag` | `record FeatureFlag(...)` |
| `QueueMessage` | `record QueueMessage(...)` |
| `TraceEvent` | `record TraceEvent(...)` |
| `ConnectionConfig` | `record ConnectionConfig(...)` |
| `EnvEntry` | `record EnvEntry(...)` |

Use `System.Text.Json` attributes for serialization compatibility with the RabbitMQ Management API's JSON format (snake_case via `JsonPropertyName` or a naming policy).

---

## Phase 2: Server-Side API Proxy (Rask.Server)

### 2.1 RabbitMQ HTTP Client Service

Create `IRabbitMqManagementClient` — a typed HttpClient that proxies to the RabbitMQ Management HTTP API.

```csharp
public class RabbitMqManagementClient(HttpClient http, IEnvironmentService envService)
{
    // Reads active env, sets base URL + Basic Auth header, forwards requests
}
```

Register as a named/typed HttpClient in DI with `IHttpClientFactory`.

### 2.2 API Controllers

Port the 44 Next.js API routes to ASP.NET Core Minimal APIs or Controllers:

| Route Group | Controller / Endpoint Group |
|---|---|
| `/api/settings` | `SettingsController` |
| `/api/envs` | `EnvironmentsController` |
| `/api/rabbitmq/overview` | `OverviewEndpoints` |
| `/api/rabbitmq/connections` | `ConnectionsEndpoints` |
| `/api/rabbitmq/channels` | `ChannelsEndpoints` |
| `/api/rabbitmq/queues` | `QueuesEndpoints` |
| `/api/rabbitmq/exchanges` | `ExchangesEndpoints` |
| `/api/rabbitmq/bindings` | `BindingsEndpoints` |
| `/api/rabbitmq/vhosts` | `VhostsEndpoints` |
| `/api/rabbitmq/users` | `UsersEndpoints` |
| `/api/rabbitmq/permissions` | `PermissionsEndpoints` |
| `/api/rabbitmq/policies` | `PoliciesEndpoints` |
| `/api/rabbitmq/feature-flags` | `FeatureFlagsEndpoints` |
| `/api/rabbitmq/global-parameters` | `ParametersEndpoints` |
| `/api/rabbitmq/vhost-limits` | `LimitsEndpoints` |
| `/api/rabbitmq/definitions` | `DefinitionsEndpoints` |
| `/api/rabbitmq/topology` | `TopologyEndpoints` |

**Recommendation:** Use **Minimal APIs** with endpoint groups for cleaner code and better perf. Group by feature using `MapGroup("/api/rabbitmq")`.

### 2.3 Storage Layer (EF Core + SQLite)

Port `lib/storage.ts` to EF Core:

```csharp
public class RaskDbContext : DbContext
{
    public DbSet<EnvironmentEntity> Environments { get; set; }
    public DbSet<SettingEntity> Settings { get; set; }
}
```

- Database path: `$RASK_DATA_DIR/rask.db` (same as current)
- WAL mode via connection string: `Data Source=rask.db;Mode=ReadWriteCreate;Cache=Shared`
- Encryption: Port the AES-256-GCM encrypt/decrypt logic using `System.Security.Cryptography.AesGcm`

### 2.4 Real-Time Tracing via SignalR

Replace the SSE EventSource (`/api/rabbitmq/trace/stream`) with **SignalR**:

```csharp
public class TraceHub : Hub
{
    // Client calls: StartTrace(vhost), StopTrace()
    // Server pushes: ReceiveTraceEvent(TraceEvent)
}
```

Server-side:
- Use `RabbitMQ.Client` to connect via AMQP
- Bind exclusive queue to `amq.rabbitmq.trace`
- On message received → broadcast to connected SignalR clients

Client-side:
- `HubConnectionBuilder` in a `TraceService`
- Blazor components subscribe to events

---

## Phase 3: Blazor WASM Client (Rask.Client)

### 3.1 Layout

Port the sidebar + header layout:

| Next.js | Blazor |
|---|---|
| `app/(app)/layout.tsx` | `Layout/MainLayout.razor` |
| `components/layout/sidebar.tsx` | `Layout/NavMenu.razor` |
| `components/layout/header.tsx` | `Layout/Header.razor` |
| `components/layout/nav-config.ts` | `Layout/NavConfig.cs` |

Use a component library (MudBlazor recommended) for:
- Navigation drawer / sidebar
- App bar / header
- Responsive layout shell

### 3.2 Pages (18 routes)

| Next.js Page | Blazor Page | Route |
|---|---|---|
| `app/(app)/page.tsx` | `Pages/Dashboard.razor` | `/` |
| `app/(app)/connections/page.tsx` | `Pages/Connections.razor` | `/connections` |
| `app/(app)/channels/page.tsx` | `Pages/Channels.razor` | `/channels` |
| `app/(app)/queues/page.tsx` | `Pages/Queues.razor` | `/queues` |
| `app/(app)/exchanges/page.tsx` | `Pages/Exchanges.razor` | `/exchanges` |
| `app/(app)/topology/page.tsx` | `Pages/Topology.razor` | `/topology` |
| `app/(app)/bindings/page.tsx` | `Pages/Bindings.razor` | `/bindings` |
| `app/(app)/vhosts/page.tsx` | `Pages/Vhosts.razor` | `/vhosts` |
| `app/(app)/users/page.tsx` | `Pages/Users.razor` | `/users` |
| `app/(app)/permissions/page.tsx` | `Pages/Permissions.razor` | `/permissions` |
| `app/(app)/policies/page.tsx` | `Pages/Policies.razor` | `/policies` |
| `app/(app)/limits/page.tsx` | `Pages/Limits.razor` | `/limits` |
| `app/(app)/parameters/page.tsx` | `Pages/Parameters.razor` | `/parameters` |
| `app/(app)/feature-flags/page.tsx` | `Pages/FeatureFlags.razor` | `/feature-flags` |
| `app/(app)/definitions/page.tsx` | `Pages/Definitions.razor` | `/definitions` |
| `app/(app)/docs/page.tsx` | `Pages/Docs.razor` | `/docs` |
| `app/(app)/privacy/page.tsx` | `Pages/Privacy.razor` | `/privacy` |
| `app/(app)/terms/page.tsx` | `Pages/Terms.razor` | `/terms` |

### 3.3 Reusable Components

| React Component | Blazor Component |
|---|---|
| `DataTable` + `useDataTable` | `Components/DataTable.razor` (or MudBlazor `MudDataGrid`) |
| `StatCard` | `Components/StatCard.razor` |
| `FloatingPublishWidget` | `Components/PublishWidget.razor` |
| `EnvGateway` | `Components/EnvGateway.razor` |
| `HelpIcon` | `Components/HelpIcon.razor` |
| `TraceTab` | `Components/TraceTab.razor` |
| `Toolbar` | `Components/Toolbar.razor` |

### 3.4 State Management

Replace TanStack React Query with a service-based pattern:

```csharp
public class RabbitMqState : IDisposable
{
    // Observable properties with change notification
    // Periodic polling via System.Threading.Timer
    // HttpClient calls to /api/* endpoints
}
```

- Register state services as **scoped** in DI
- Use `INotifyPropertyChanged` or custom events for UI binding
- Polling: `PeriodicTimer` with 5-10 second intervals (matching current behavior)
- Alternatively, consider a library like **Fluxor** for more structured state management

### 3.5 Theming (Dark/Light Mode)

- MudBlazor has built-in dark/light theme support
- Port CSS variables to MudBlazor `MudTheme` configuration
- Persist preference in `localStorage` via JS interop or `ProtectedLocalStorage`

### 3.6 Topology Visualization

Replace `@xyflow/react` + `dagre` with one of:
- **Blazor.Diagrams** — closest equivalent, supports custom nodes/edges, layouts
- **D3 via JS interop** — if Blazor.Diagrams lacks features
- **SVG rendering** — manual Blazor SVG components with dagre algorithm ported to C#

Recommendation: Start with **Blazor.Diagrams** and fall back to JS interop if needed.

---

## Phase 4: Styling & CSS

### 4.1 Approach

- Remove Tailwind CSS entirely
- Use **MudBlazor** component library (Material Design, production-ready)
  - Built-in responsive grid, spacing, typography
  - Dark/light theming
  - 70+ components covering all current UI needs
- Custom CSS in `wwwroot/css/app.css` for Rask-specific branding

### 4.2 Asset Migration

- Move logos and icons from `public/` to `wwwroot/`
- Update favicon references in `index.html`

---

## Phase 5: Docker & Deployment

### 5.1 Dockerfile

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src
COPY . .
RUN dotnet publish src/Rask.Server/Rask.Server.csproj -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:9.0
WORKDIR /app
COPY --from=build /app .
EXPOSE 35672
ENV ASPNETCORE_URLS=http://+:35672
ENTRYPOINT ["dotnet", "Rask.Server.dll"]
```

- Multi-stage build (same pattern as current)
- Same port (35672)
- Data directory volume mount at `/app/data`
- The Server project serves the WASM client files automatically

### 5.2 Environment Variables

Keep the same env vars:
- `RABBITMQ_HOST`, `RABBITMQ_MANAGEMENT_PORT`, `RABBITMQ_AMQP_PORT`
- `RABBITMQ_USER`, `RABBITMQ_PASSWORD`, `RABBITMQ_VHOST`
- `STORAGE_ENCRYPTION_KEY`
- `RASK_DATA_DIR`

### 5.3 Database Migration

The SQLite schema is simple (2 tables). Options:
- **EF Core migrations** to create the new schema
- **Backward-compatible**: same table names and column structure so existing `rask.db` files work without migration

---

## Phase 6: Testing

### 6.1 Server Tests (xUnit)

- Unit tests for `RabbitMqManagementClient`
- Integration tests for API endpoints (using `WebApplicationFactory`)
- Storage/encryption tests

### 6.2 Client Tests (bUnit)

- Component rendering tests
- Service/state management tests

### 6.3 E2E Tests (Playwright)

- Port existing Playwright tests from `e2e/`
- Same test scenarios, updated selectors for Blazor-rendered HTML

---

## Execution Order

| Step | Phase | Description | Depends On |
|------|-------|-------------|------------|
| 1 | 0 | Scaffold solution, add NuGet packages | — |
| 2 | 1 | Port TypeScript types to C# shared models | Step 1 |
| 3 | 2.3 | EF Core DbContext + SQLite storage | Step 2 |
| 4 | 2.1 | RabbitMQ Management HTTP client service | Step 2 |
| 5 | 2.2 | API proxy endpoints (Minimal APIs) | Steps 3, 4 |
| 6 | 3.1 | Blazor layout shell (sidebar, header) | Step 1 |
| 7 | 3.2 | Dashboard page (first page, proves the stack) | Steps 5, 6 |
| 8 | 3.3 | DataTable, StatCard, common components | Step 7 |
| 9 | 3.2 | Remaining 17 pages | Step 8 |
| 10 | 2.4 | SignalR trace hub + TraceTab component | Steps 5, 9 |
| 11 | 3.6 | Topology visualization | Step 9 |
| 12 | 4 | Theming, branding, polish | Step 9 |
| 13 | 5 | Dockerfile, docker-compose, CI | Step 12 |
| 14 | 6 | Tests (unit, component, e2e) | Step 13 |
| 15 | — | Remove Next.js source, cleanup | Step 14 |

---

## Risk Mitigation

| Risk | Mitigation |
|---|---|
| WASM download size (~5-10MB initial) | AOT trimming, lazy loading, compression (Brotli) |
| Blazor.Diagrams lacks topology features | Fall back to JS interop with existing React Flow code |
| SignalR adds complexity vs SSE | SSE is also possible via `HttpClient` streaming in Blazor |
| MudBlazor doesn't match current UI exactly | Custom CSS overrides; focus on functionality first, polish later |
| SQLite schema compatibility | Keep same table/column structure, test with existing DB files |

---

## What Gets Deleted (After Migration)

- `/app/` — Next.js pages and API routes
- `/components/` — React components
- `/lib/` — TypeScript utilities and types
- `/e2e/` — Playwright tests (rewritten)
- `package.json`, `pnpm-lock.yaml`, `node_modules/`
- `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`
- `vitest.config.ts`, `eslint.config.mjs`
- `components.json` (shadcn config)

## What Stays

- `/public/` assets → moved to `wwwroot/`
- `/docs/` — documentation
- `.github/` — CI workflows (updated for dotnet)
- `Dockerfile` — rewritten for dotnet
- `rask.db` — backward compatible
- `LICENSE`, `README.md`, `.env.example`
