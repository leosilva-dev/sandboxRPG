import { Schema, MapSchema, defineTypes } from '@colyseus/schema';
import { PlayerState } from './PlayerState.js';

export class MapState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
  }
}

defineTypes(MapState, {
  players: { map: PlayerState },
});
