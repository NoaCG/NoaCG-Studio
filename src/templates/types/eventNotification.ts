// EVENT NOTIFICATION - the streaming event contract.
//
// Follower, member, donation, gift and raid are values in the same five fields. The machine
// models only choreography, while the template-owned FIFO in streamNotifications/shared.ts
// serializes complete data snapshots so a burst of events never overwrites the one on air.

import { paletteById } from '../../model/wizard';
import { sn01, sn02, sn03, sn04 } from '../streamNotifications';
import type { GraphicType } from './graphicType';

const ENTER_SETTLE = 0.01;
const EVENT_DWELL = 8;

export const eventNotificationType: GraphicType = {
  id: 'event-notification',
  name: 'Event notification',
  description: 'One queued streaming event - follower, member, donation, gift or raid - with optional artwork.',
  structure: {
    prefix: 'stream-notification',
    category: 'stream-notification',
    parts: [
      { id: 'box', selector: '.stream-notification-box', kind: 'panel', required: true },
      { id: 'eventLabel', selector: '#f0', kind: 'line', required: true },
      { id: 'actor', selector: '#f1', kind: 'line', required: true },
      { id: 'amount', selector: '#f2', kind: 'line', required: true },
      { id: 'message', selector: '#f3', kind: 'line', required: true },
      { id: 'avatar', selector: '#f4', kind: 'image', required: true },
    ],
  },
  fields: [
    { key: 'eventLabel', label: 'Event label', kind: 'text', value: 'NEW MEMBER', role: 'line' },
    { key: 'actor', label: 'Actor', kind: 'text', value: 'NovaRider', role: 'line' },
    { key: 'amount', label: 'Amount / count', kind: 'text', value: '12 MONTHS', role: 'line' },
    {
      key: 'message',
      label: 'Message',
      kind: 'lines',
      value: 'Welcome back to the crew - thank you for the support.',
      role: 'line',
    },
    { key: 'avatar', label: 'Avatar / icon', kind: 'image', value: '', role: 'logo' },
  ],
  machine: {
    main: {
      edges: [
        // Entrance always settles into the explicit Hold waypoint.
        { from: { waypoint: 0 }, to: { waypoint: 1 }, trigger: 'timer', after: ENTER_SETTLE },
        // The ordinary hold is timed; entering manual-hold below cancels this timer.
        { from: { waypoint: 1 }, to: { waypoint: -1 }, trigger: 'timer', after: EVENT_DWELL },
        // Skip is legal while entering, holding or manually held.
        { from: { waypoint: 0 }, to: { waypoint: -1 }, trigger: 'operator', event: 'skip' },
        { from: { waypoint: 1 }, to: { waypoint: -1 }, trigger: 'operator', event: 'skip' },
        // Replay restarts the entrance without changing or consuming queued data.
        { from: { waypoint: 0 }, to: { waypoint: 0 }, trigger: 'operator', event: 'replay' },
        { from: { waypoint: 1 }, to: { waypoint: 0 }, trigger: 'operator', event: 'replay' },
      ],
      branches: [
        {
          id: 'manual-hold',
          name: 'Manual hold',
          timeline: null,
          edges: [
            { from: { waypoint: 0 }, to: 'manual-hold', trigger: 'operator', event: 'hold' },
            { from: { waypoint: 1 }, to: 'manual-hold', trigger: 'operator', event: 'hold' },
            { from: 'manual-hold', to: { waypoint: 1 }, trigger: 'operator', event: 'resume' },
            { from: 'manual-hold', to: { waypoint: -1 }, trigger: 'operator', event: 'skip' },
            { from: 'manual-hold', to: { waypoint: 0 }, trigger: 'operator', event: 'replay' },
          ],
        },
      ],
    },
  },
  controls: [
    { event: 'hold', label: 'Hold on air', section: 'Notification', order: 1 },
    { event: 'resume', label: 'Resume timer', section: 'Notification', order: 2 },
    { event: 'replay', label: 'Replay', section: 'Notification', order: 3 },
    { event: 'skip', label: 'Skip', section: 'Notification', order: 4 },
  ],
  capabilities: {
    maxLines: 4,
    logo: 'optional',
    animationPresets: ['line-reveal', 'mask-wipe', 'slide-up', 'fade'],
    defaultZone: 'bottom-left',
  },
  designs: [
    {
      id: 'sn01',
      name: 'House Signal',
      description: sn01.description,
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      animationPresets: sn01.animationPresets,
      create: (_type, options) => sn01.create(options),
    },
    {
      id: 'sn02',
      name: 'Quiet Activity',
      description: sn02.description,
      styleTag: 'minimal',
      palette: paletteById('ivory'),
      fontId: 'inter',
      animationPresets: sn02.animationPresets,
      create: (_type, options) => sn02.create(options),
    },
    {
      id: 'sn03',
      name: 'Arena Event',
      description: sn03.description,
      styleTag: 'sport',
      palette: paletteById('volt'),
      fontId: 'oswald',
      animationPresets: sn03.animationPresets,
      create: (_type, options) => sn03.create(options),
    },
    {
      id: 'sn04',
      name: 'Glass Bloom',
      description: sn04.description,
      styleTag: 'glass',
      palette: paletteById('frost'),
      fontId: 'manrope',
      animationPresets: sn04.animationPresets,
      create: (_type, options) => sn04.create(options),
    },
  ],
};
