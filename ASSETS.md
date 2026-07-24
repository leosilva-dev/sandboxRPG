# Fontes dos assets visuais

## Personagem (jogador)

Sprites em `client/public/assets/character/` (idle/walk/run, 4 direções) foram gerados no
**Universal LPC Spritesheet Character Generator**:
https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/

Configuração usada:
```
sex=male&body=Body_Color_light&head=Human_Male_light&expression=Neutral_light&hair=Spiked_chestnut&clothes=TShirt_black&legs=Pants_navy&shoes=Basic_Shoes_gray&backpack=Backpack_walnut
```

URL completa com essa config (basta abrir para reabrir o gerador já configurado):
https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/#sex=male&body=Body_Color_light&head=Human_Male_light&expression=Neutral_light&hair=Spiked_chestnut&clothes=TShirt_black&legs=Pants_navy&shoes=Basic_Shoes_gray&backpack=Backpack_walnut

Estilo: **LPC (Liberated Pixel Cup)**. Usar esse mesmo site/URL para gerar NPCs, inimigos ou variações
mantendo o estilo visual consistente com o personagem atual.

## Mapa / cenário / terreno

Pacote **Tiny Swords**, por pixelfrog-assets (itch.io), baixado em duas gerações e importado para
`client/public/assets/tiny-swords/`:

- `free-pack/` — geração mais antiga ("Tiny Swords (Free Pack)"): 5 exércitos recoloridos
  (black/blue/purple/red/yellow), cada um com unidades archer/lancer/monk/pawn/warrior e prédios
  archery/barracks/castle/house1-3/monastery/tower, terreno flat de tom único, recursos, decorações,
  partículas, kit de UI completo. **Não está em uso no terreno atual** — as unidades desse pack são
  majoritariamente sprites de direção única (estilo RTS), não servem para um personagem que anda
  livremente em 4 direções.
- `update-010/` — geração mais nova ("Tiny Swords"): 2 facções (knights vs goblins), terreno mais rico
  (flat + elevação, pontes), recursos (mina de ouro, árvores, ovelhas), kit de UI 9-slice mais polido.
  **É a que está realmente em uso** para o terreno da floresta.
- `CREDITS.txt` documenta as duas gerações e a ressalva de licença ausente.
- Arquivos-fonte `.aseprite` ficam em `/art-source/tiny-swords/{free-pack,update-010}/` (mesma
  estrutura), fora de `client/public` para não inflar o build (o navegador nunca busca esses arquivos).

**Atenção à licença**: nenhum dos dois downloads veio com licença/README. Antes de monetizar ou
publicar qualquer coisa feita com esses assets, checar os termos atuais na página do itch.io do
Tiny Swords — não assumir que o pack gratuito é livre para uso comercial.

### Onde o terreno está aplicado no código

- Chão: `terrain/ground/tilemap-flat.png` (de `update-010`) carregado como spritesheet Phaser
  (frameWidth/Height 64 = TILE_SIZE, sem escala). Sheet 640x256 = 10 colunas x 4 linhas.
  - O "blob" de grama utilizável é só 3x3 (não 4x4): col0/row0 e col2/row2 são bordas, col1/row1 é o
    preenchimento limpo verificado. Colunas/linhas 3 em diante são peças soltas, não continuação.
  - Areia/caminho (`col6/row1`) só tem UM preenchimento limpo confirmado e UMA borda confirmada
    (`col7`, borda do lado direito) — sem contraparte esquerda/topo/baixo confirmada, por isso é
    tratado como fill-only, sem borda.
  - Lógica de seleção de frame: `makeGroundFrameGetter` em `client/src/maps/forest.js`. Caminho é
    sempre fill plano (sem borda); grama recebe uma borda fina só no lado que encosta em um tile de
    caminho — dá o efeito de contorno sutil ao redor do caminho, sem "grade" por toda a grama.
- Decorações: arquivos individuais `deco/01..18.png` (arbustos/pedras/cogumelos/plantas/um ídolo
  espantalho usado como centro do círculo de pedras) carregados como imagens simples, mais
  `resources/trees/tree.png` como spritesheet (frameWidth/Height 192, 6 variantes de conífera nos
  frames 0-5). Escalas em `TREE_BASE_SCALE` / `DECO_BASE_SCALE`, ambos em `client/src/maps/forest.js`.
- Geração do caminho (forma, não visual): `buildMeanderingPath`, `buildPath` (disk-stamping) e
  `closeNotches` (fecha reentrâncias isoladas de grama, iterando até estabilizar) — tudo em
  `client/src/maps/forest.js`.

## Choque de estilo (pendência conhecida)

O personagem (LPC, traço fino) e o cenário (Tiny Swords, contorno preto grosso "cartoon puffy") têm
linguagens visuais diferentes. A troca do personagem para combinar com o Tiny Swords foi
deliberadamente adiada ("depois vemos o personagem do jogador, por hora mantém o asset atual") — ainda
está em aberto.
