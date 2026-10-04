// Test-only Nest bootstrap. No fixture endpoints are added to the application.
const { createRequire } = require("node:module");
const serverRequire = createRequire(
  require.resolve("../../server/package.json"),
);
serverRequire("reflect-metadata");
const { NestFactory } = serverRequire("@nestjs/core");
const { IoAdapter } = serverRequire("@nestjs/platform-socket.io");
const { AppModule } = serverRequire("./dist/app.module.js");
const { GameService } = serverRequire("./dist/game/game.service.js");

exports.start = async (port = 0) => {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.useWebSocketAdapter(new IoAdapter(app));
  app.enableCors({ origin: true });
  const games = app.get(GameService);
  const create = games.create.bind(games);
  let scenario = "seeded";
  games.create = (params) => {
    const game = create({
      ...params,
      config: { ...params.config, seed: scenario === "seeded" ? 2 : 1 },
    });
    if (scenario === "seeded") return game;
    const s = game.state;
    const [alice, bob] = params.players;
    const card = (id, rank) => ({ kind: "standard", id, rank, suit: "Clubs" });
    s.turn.activePlayer = alice;
    s.byId[alice].stock.faceDown = [card("a-two", 2), card("a-ace", 1)];
    s.byId[bob].stock.faceDown = [card("b-four", 4), card("b-three", 3)];
    s.byId[alice].hand.cards = [card("a-queen", 12), card("a-hand-ace", 1)];
    s.byId[bob].hand.cards = [card("b-nine", 9)];
    s.byId[alice].discards[0] = [card("a-old", 6), card("a-top", 7)];
    s.byId[bob].discards[0] = [card("b-old", 8), card("b-top", 9)];
    s.deck.drawPile = [];
    s.deck.recyclePile = [];
    s.center.buildPiles = [
      {
        id: "build-1",
        nextRank: 12,
        cards: Array.from({ length: 11 }, (_, i) => card(`built-${i}`, i + 1)),
      },
    ];
    if (scenario === "fallback") {
      s.center.buildPiles = [];
      s.byId[alice].stock.faceDown = [card("a-eight", 8), card("a-seven", 7)];
      s.byId[bob].stock.faceDown = [card("b-eight", 8)];
      s.byId[alice].hand.cards = [];
      s.byId[bob].hand.cards = [card("b-ace", 1)];
    }
    return game;
  };
  await app.listen(port, "127.0.0.1");
  const fixture = {
    url: await app.getUrl(),
    scenario: (next) => {
      if (!["seeded", "controlled", "fallback"].includes(next)) {
        throw new Error(`Unknown journey scenario: ${next}`);
      }
      scenario = next;
    },
    close: () => app.close(),
    restart: async () => {
      const currentPort = new URL(fixture.url).port;
      await fixture.close();
      const replacement = await exports.start(Number(currentPort));
      fixture.scenario = replacement.scenario;
      fixture.close = replacement.close;
    },
  };
  return fixture;
};
