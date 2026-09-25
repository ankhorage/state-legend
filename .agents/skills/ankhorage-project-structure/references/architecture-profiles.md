# Architecture Profiles

Choose the profile from actual ownership and consumers. Profiles define allowed vocabulary and
dependency direction; they are not templates that require every listed directory.

## Simple, value, or contracts library

Use for portable types, deterministic values, parsers, constants, algorithms, and small libraries
without application orchestration.

Typical forms:

```text
src/
  index.ts
  <domain-or-topic>/
  types/
  constants/
  utils/
```

Do not invent ports, adapters, application, or composition layers when there is no external edge to
abstract. Contracts packages additionally keep public declarations serializable and free of runtime
implementation.

## Reusable UI or design-system library

Use semantic UI ownership and stable foundation layers rather than fake use cases:

```text
src/
  foundation/
  theme/
  layout/
  primitives/
  components/
  patterns/
  registry/
```

Higher-level UI may depend on lower-level foundations; foundations must not depend upward on composed
components or registries. Provider execution belongs outside reusable presentation components.

## Application, engine, or hybrid package

Use when the package owns use cases, state transitions, external systems, or several delivery edges.
Domain-first and feature-first organization are both valid when coherent.

Domain-first example:

```text
src/
  <domain>/
    domain/
    application/
    ports/
    adapters/
    composition/
  cli/
  host/
  app/
  platform/
```

Feature-first example:

```text
src/
  features/
    <feature>/
      domain/
      application/
      ports/
      adapters/
      composition/
  cli/
```

Only create the role directories that the capability actually needs. A pure domain feature can stop
at `domain/`; an in-memory use case need not invent an outbound adapter.

## Provider or platform adapter package

Use when the package deliberately implements an external technology boundary:

```text
src/
  contracts/
  planning/
  adapters/
  composition/
  cli/
```

Portable configuration and planning stay independent from SDK/runtime values. Concrete provider code
stays in adapters.

## Tooling package

Command-centric tooling may use:

```text
src/
  cli/
  policy/
  application/
  adapters/
  composition/
```

Policy remains deterministic. Filesystem, process, registry, network, and GitHub behavior stay at
the edge.

## Generated standalone application

A generated app owns its manifest, lockfile, installation, validation, build, and deployment inputs.
A parent tool may invoke it with the app as `cwd`, but it must not depend on a hidden parent
workspace, sibling source, or installation state.

## Repository-specific profile

A repository may define a narrower profile when its domain genuinely needs one. That profile must be
documented in the managed project-structure skill or an explicit repository reference and must still
respect the shared standalone and dependency-direction invariants. Studio is the canonical example:
its `features/` taxonomy is intentional and each substantial feature may layer internally.

## Combination rules

Folder names create obligations:

- `domain/`: inner policy; no outward mechanism dependencies.
- `application/`: use-case orchestration; no concrete adapter/composition dependency.
- `ports/`: capability contracts required by inner policy.
- `adapters/`: concrete edge implementations; there must be an inward capability/policy to adapt.
- `composition/`: selects and wires concrete implementations; do not create it without pieces to wire.
- `features/`: siblings are product capabilities, not technical categories.
- `core/`: only a narrowly defined inner-policy layer; never a generic dumping ground.
- `common/`, `shared/`, and `helpers/`: not architectural ownership categories.

Doctor should validate these combinations and dependency directions rather than require every
repository to match one tree.
