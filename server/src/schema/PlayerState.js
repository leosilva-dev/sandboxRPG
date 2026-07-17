import { Schema, defineTypes } from '@colyseus/schema';

export class PlayerState extends Schema {
  constructor() {
    super();
    this.name = '';
    this.x = 0;
    this.y = 0;
    this.facing = 'down';
    this.moving = false;
    this.running = false;
    this.isJumping = false;
    this.jumpHeight = 0;
  }
}

defineTypes(PlayerState, {
  name: 'string',
  x: 'float32',
  y: 'float32',
  facing: 'string',
  moving: 'boolean',
  running: 'boolean',
  isJumping: 'boolean',
  jumpHeight: 'float32',
});
