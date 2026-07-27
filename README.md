![](https://img.shields.io/badge/Foundry-v14-informational)
[![](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-%243-orange)](https://www.buymeacoffee.com/T2tZvWJ)


# NPC Chatter

Your NPCs have things to say.
This Module provides a small API that allows your NPCs to randomly chatter off of roll tables defined for them.

Chatter is displayed as ChatBubbles only, and won't dump to the Chat Log.

I recommend you turn off the Core "Pan to Token Speaker" setting or else risk whiplash.

![](npc-chatter.gif)

# Installation

In Foundry VTT's **Add-on Modules** setup screen, choose **Install Module** and
use this manifest URL:

```text
https://github.com/DimitroffVodka/FoundryVtt-Npc-Chatter/releases/latest/download/module.json
```

For a manual installation, extract `npc-chatter.zip` into the Foundry user-data
`Data/modules/npc-chatter` directory. Fully restart Foundry after installing or
updating the module.

# Setup

1. Create a Roll Table containing the NPC's possible dialogue.
2. Open the NPC's token HUD and click the table-list button.
3. Select one or more Roll Tables and save the assignment.
4. Click the speech-bubble button on the token HUD to make that NPC speak.

The same assignment dialog is available from the **NPC Chatter Tables** control
in an Actor sheet's header. Assignments are stored on the Actor, so linked tokens
for that Actor share the same tables. Unlinked tokens can keep their own
synthetic-Actor assignment.

Any world Roll Table can be assigned; its name and folder no longer matter. A
table needs at least one result and a valid roll formula.

# Usage

NPC Chatter adds two tools to the Tokens scene controls:

- **Make a random NPC speak** immediately triggers global chatter.
- **Toggle automatic chatter** starts or stops periodic chatter.

The interval and whether global chatter uses the active or currently viewed
scene are configured under **Module Settings → NPC Chatter**. Only Foundry's
active GM client runs the automatic timer, preventing duplicate bubbles.

The included **NPC Chatter** macro compendium remains available for automation
and integrations, but normal use no longer requires importing or running
macros.

## Legacy table matching

Existing worlds continue to work without migration. When an Actor has no
explicit assignment, NPC Chatter still recognizes:

- Tables whose names end in `Chatter`.
- Tables inside a Roll Table folder named `NPC Chatter`.

For example, `Villager Chatter` matches tokens named `Villager A`, `Villager B`,
and `Villager C`.

![](chattertablesetup.PNG)

## Trigger Happy

[Trigger Happy](https://github.com/kakaroto/fvtt-module-trigger-happy) can trigger NPC chatter as well. Here's an example to get you started:

When an Actor walks into a Room (defined by an invisble actor), have a specific Token chatter: `@Actor[TriggerA] @Macro[OXyjmVhEGo3eTaJz]{Specific Token Chatter}`

# API

## Global Chatter

Picks a random configured NPC on the active or viewed scene, rolls one of its
assigned tables, then broadcasts the result as a chat bubble. Legacy name
matching is used for Actors without explicit assignments.

```js
async globalChatter()
```

## Global Chatter Every Interval

Every interval as measured in milliseconds, executes `globalChatter()`.

```js
randomGlobalChatterEvery(milliseconds)
```


## Disable Global Chatter

Clears out the timer on `randomGlobalChatterEvery`

```js
turnOffGlobalTimerChatter()
```

## Token Chatter

Given a `Token`, rolls one of its assigned tables and displays the result as a
chat bubble. Legacy name matching is used when the Actor has no assignment.

```js
async tokenChatter(token)
```

## Assign Tables

Stores one or more world Roll Table IDs on the Token's Actor. Pass an empty
array to remove the assignment and restore legacy matching.

```js
async assignTables(tokenOrActor, tableIds)
```

## Open the Assignment Dialog

```js
async openTableAssignment(tokenOrActor)
```

## Selected Chatter

Grabs a randomly selected controlled token, finds a matching Chatter Table,
and broadcasts a rolled result as a chat bubble.

```js
  async selectedChatter()
```
