# Changelog

All notable changes to this fork are documented in this file.

## [2.4.0] - 2026-07-27

### Added

- Foundry VTT v14 compatibility and a v14 LevelDB macro compendium.
- Actor-level assignment of one or more world Roll Tables, without table-name
  or folder requirements.
- Roll Table assignment controls in the token HUD and Actor sheet header.
- Token HUD control for making an individual NPC speak immediately.
- Tokens-toolbar controls for one-off global chatter and automatic chatter.
- World settings for automatic chatter and its interval.
- Active-GM coordination so automatic chatter runs from only one GM client.
- A public module API on `game.modules.get("npc-chatter").api`.
- Automated coverage for assignments, legacy matching, scene controls, timers,
  and Foundry v14 bubble broadcasting.

### Changed

- Global chatter now chooses from NPCs that have explicit assignments or valid
  legacy matches.
- Chat bubbles use Foundry v14's core bubble-broadcasting API.
- The module manifest, package metadata, documentation, and included macros
  have been updated for Foundry v14.
- Normal use no longer requires importing or executing macros.

### Fixed

- Modernized scene, token, Roll Table result, setting, and module API access for
  Foundry v14.
- Prevented duplicate timers when multiple GM clients are connected.
- Added clear warnings for missing assignments, deleted tables, empty results,
  and invalid timer intervals.

### Compatibility

- Existing tables whose names end in `Chatter`, and tables in an `NPC Chatter`
  Roll Table folder, continue to work without migration.
- Existing macros and public `game.npcChatter` calls remain supported.

[2.4.0]: https://github.com/DimitroffVodka/FoundryVtt-Npc-Chatter/compare/v2.2.0...v2.4.0
