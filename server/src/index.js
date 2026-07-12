import { createServer } from 'http';
import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { MapRoom } from './rooms/MapRoom.js';

const port = Number(process.env.PORT) || 2567;

const gameServer = new Server({
  transport: new WebSocketTransport({
    server: createServer(),
  }),
});

// Um tipo de sala registrado por mapa do jogo — cada nome vira uma instância
// única e isolada (jogadores de mapas diferentes não se veem).
gameServer.define('forest', MapRoom, { mapId: 'forest' });
gameServer.define('tavern', MapRoom, { mapId: 'tavern' });
gameServer.define('cave', MapRoom, { mapId: 'cave' });

gameServer.listen(port);
console.log(`Servidor Colyseus rodando na porta ${port}`);
