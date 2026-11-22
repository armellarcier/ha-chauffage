# The Chauffage panel

**English** · [Français](panel.fr.md)

You set Chauffage up in the **Chauffage** panel, in the sidebar. Administrators open the panel,
and so do other users with the [access level](#who-may-change-what) *Set up*. For every day,
use the dashboard cards.

## The panel's pages

The panel has three tabs:

- **Thermostats.** Schedule another thermostat, or pause or forget a thermostat from its ⋮
  menu.
- **Schedules.** Create, activate, rename, move or delete a schedule. Write the
  [activation rules](activation-rules.md) below the list of schedules.
- **Presets.** Set what each preset does on each thermostat. See [Presets](presets.md).

**Settings.** Open the ⚙ at the top right of the panel to set the override duration, the end of
overrides, how long a thermostat turned off stays off, and the access level. See
[Overrides](overrides.md). To change the other [options](#options), click *Other Chauffage
options* at the foot of the settings. The link opens the integration's page, where you click
*Configure*. Only administrators see the link.

## Open a thermostat's page

A thermostat's page shows the thermostat's week in each schedule. From the page, you can copy a
week to another schedule, and show the thermostat's *History*.

- In the Chauffage panel, on the *Thermostats* tab, click the thermostat's name.
- In the thermostat's more-info dialog, click *Edit its week*.
- On the device of the scheduled thermostat, click *Visit*. See
  [On each scheduled thermostat's device](automations.md#on-each-scheduled-thermostats-device).

With the access level *Plan*, *Edit its week* opens the dashboard that holds the thermostat's
schedule card, not the panel.

Each page has its own address, for example `/chauffage/thermostats/climate.living_room`. You can
link to a page from a dashboard or a notification.

## Who may change what

Administrators can always change everything. You choose what the other users may change: their
**access level**.

| Access level | What users who are not administrators can do |
|---|---|
| *Use*, the default | Set and end overrides, pause a thermostat, change the active schedule. |
| *Plan* | Also edit the weeks, and create, rename, move or delete schedules, from the dashboard cards. |
| *Set up* | Also everything in the Chauffage panel: the presets, the activation rules, the scheduled thermostats and the settings of overrides. |

To choose the access level, open the ⚙ of the Chauffage panel, or the integration's
[options](#options). Only administrators choose the access level.

**With *Set up*, every user sees *Chauffage* in the sidebar.** Each user can hide the entry in
their profile.

**An access level doesn't lock the heating.** The access level covers the cards and the panel
only. Every user can still turn a thermostat's knob, or change Chauffage's entities. To keep a
child away from the weeks, give the child a dashboard without the schedule card.

## Scheduled thermostats

To schedule a thermostat, edit its week in a card. You can also choose the thermostat under
*Schedule another thermostat*, on the *Thermostats* tab of the panel.

A thermostat stays scheduled until you forget it, even if you remove it from a card. To forget a
thermostat, open its ⋮ menu, then *Forget…*. If you delete a thermostat's entity from Home
Assistant, Settings → Repairs offers to forget the thermostat.

### Pause a thermostat

Pause a thermostat to run its room by hand for a few days, or to leave a heater off all summer.
Click *Pause control* in the thermostat's more-info dialog or in the Chauffage panel. You can
also turn off the thermostat's **Control** switch.

While the thermostat is paused, Chauffage keeps its weeks but stops controlling it.

To give the thermostat back to Chauffage, click *Resume control*, or turn the **Control** switch
back on.

Every user who may control the thermostat can pause it, not only administrators.

## Options

To change the options, go to Settings → Devices & services → Chauffage → *Configure*.

- **Override duration.** How long a setpoint changed by hand lasts, 2 hours by default.
- **End of overrides.** *For the override duration* by default. See
  [Choose how long an override lasts](overrides.md#choose-how-long-an-override-lasts).
- **Turned off.** How long a thermostat turned off stays off, *Until the next slot* by default.
  See [Turn a thermostat off by hand](overrides.md#turn-a-thermostat-off-by-hand).
- **Use the thermostats' presets.** On by default. Turn this option off to drive every
  thermostat with temperatures that you set in Chauffage.
- **Show Chauffage in the sidebar.** On by default. If you hide Chauffage from the
  sidebar, open the panel from the cards, or with the *Visit* button of a scheduled thermostat's
  device.
- **Name in the sidebar.** *Chauffage* by default. Give the panel another name, for example
  *Planning* if you already have a dashboard called *Thermostats*. To get *Chauffage* back,
  empty the field.
- **Access level of users who are not administrators.** *Use* by default. See
  [Who may change what](#who-may-change-what).

You can also change the first three options from the ⚙ of the panel, or with their entities.
