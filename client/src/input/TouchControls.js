const JOYSTICK_RADIUS = 55;
const DEADZONE = 0.25;

function isTouchDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

function styledDiv(styles) {
  const el = document.createElement('div');
  Object.assign(el.style, styles);
  return el;
}

const BUTTON_BASE_STYLE = {
  position: 'absolute',
  width: '64px',
  height: '64px',
  borderRadius: '50%',
  background: 'rgba(255,255,255,0.15)',
  border: '2px solid rgba(255,255,255,0.4)',
  color: '#fff',
  fontFamily: 'monospace',
  fontSize: '13px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  userSelect: 'none',
  touchAction: 'none',
};

// Joystick virtual (canto inferior esquerdo) + botões de correr/pular (canto
// inferior direito), só criados em dispositivos de toque — teclado no
// desktop continua funcionando sem nenhuma mudança.
export default class TouchControls {
  constructor() {
    this.enabled = isTouchDevice();
    this.state = { up: false, down: false, left: false, right: false, run: false };
    this.jumpQueued = false;

    if (!this.enabled) return;

    this._buildDom();
    this._bindJoystick();
    this._bindButton(this.runButton, () => {
      this.state.run = true;
    }, () => {
      this.state.run = false;
    });
    this._bindButton(this.jumpButton, () => {
      this.jumpQueued = true;
    });
  }

  getInput() {
    return this.state;
  }

  consumeJumpPress() {
    if (!this.jumpQueued) return false;
    this.jumpQueued = false;
    return true;
  }

  _buildDom() {
    this.container = styledDiv({
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      zIndex: '10000',
    });

    this.joystickBase = styledDiv({
      position: 'absolute',
      left: '32px',
      bottom: '32px',
      width: `${JOYSTICK_RADIUS * 2}px`,
      height: `${JOYSTICK_RADIUS * 2}px`,
      borderRadius: '50%',
      background: 'rgba(255,255,255,0.12)',
      border: '2px solid rgba(255,255,255,0.35)',
      touchAction: 'none',
      pointerEvents: 'auto',
    });
    this.joystickKnob = styledDiv({
      position: 'absolute',
      left: '50%',
      top: '50%',
      width: '48px',
      height: '48px',
      marginLeft: '-24px',
      marginTop: '-24px',
      borderRadius: '50%',
      background: 'rgba(255,255,255,0.5)',
      pointerEvents: 'none',
    });
    this.joystickBase.appendChild(this.joystickKnob);

    this.runButton = styledDiv({
      ...BUTTON_BASE_STYLE,
      right: '112px',
      bottom: '44px',
      pointerEvents: 'auto',
    });
    this.runButton.textContent = 'RUN';

    this.jumpButton = styledDiv({
      ...BUTTON_BASE_STYLE,
      right: '32px',
      bottom: '44px',
      pointerEvents: 'auto',
    });
    this.jumpButton.textContent = 'JUMP';

    this.container.appendChild(this.joystickBase);
    this.container.appendChild(this.runButton);
    this.container.appendChild(this.jumpButton);
    document.body.appendChild(this.container);
  }

  _bindJoystick() {
    let activePointerId = null;
    let centerX = 0;
    let centerY = 0;

    const resetKnob = () => {
      this.joystickKnob.style.transform = 'translate(0, 0)';
      this.state.up = false;
      this.state.down = false;
      this.state.left = false;
      this.state.right = false;
    };

    const updateFromPointer = (clientX, clientY) => {
      let dx = clientX - centerX;
      let dy = clientY - centerY;
      const dist = Math.hypot(dx, dy);
      if (dist > JOYSTICK_RADIUS) {
        dx = (dx / dist) * JOYSTICK_RADIUS;
        dy = (dy / dist) * JOYSTICK_RADIUS;
      }
      this.joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;

      const nx = dx / JOYSTICK_RADIUS;
      const ny = dy / JOYSTICK_RADIUS;
      this.state.left = nx < -DEADZONE;
      this.state.right = nx > DEADZONE;
      this.state.up = ny < -DEADZONE;
      this.state.down = ny > DEADZONE;
    };

    // Escuta pointermove/pointerup no window (não só no elemento) porque o
    // dedo sai da área visual da base durante o arrasto — sem isso o
    // joystick trava assim que o toque cruza a borda do círculo.
    const onMove = (e) => {
      if (e.pointerId !== activePointerId) return;
      updateFromPointer(e.clientX, e.clientY);
    };
    const onEnd = (e) => {
      if (e.pointerId !== activePointerId) return;
      activePointerId = null;
      resetKnob();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
    };

    this.joystickBase.addEventListener('pointerdown', (e) => {
      activePointerId = e.pointerId;
      const rect = this.joystickBase.getBoundingClientRect();
      centerX = rect.left + rect.width / 2;
      centerY = rect.top + rect.height / 2;
      updateFromPointer(e.clientX, e.clientY);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onEnd);
      window.addEventListener('pointercancel', onEnd);
    });
  }

  _bindButton(button, onDown, onUp) {
    button.addEventListener('pointerdown', (e) => {
      button.style.background = 'rgba(255,255,255,0.4)';
      onDown();

      if (!onUp) return;
      const release = (ev) => {
        if (ev.pointerId !== e.pointerId) return;
        button.style.background = 'rgba(255,255,255,0.15)';
        onUp();
        window.removeEventListener('pointerup', release);
        window.removeEventListener('pointercancel', release);
      };
      window.addEventListener('pointerup', release);
      window.addEventListener('pointercancel', release);
    });

    if (!onUp) {
      button.addEventListener('pointerup', () => {
        button.style.background = 'rgba(255,255,255,0.15)';
      });
    }
  }

  destroy() {
    this.container?.remove();
  }
}
