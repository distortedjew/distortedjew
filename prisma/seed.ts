import { PrismaClient } from "@prisma/client";
import { ACHIEVEMENTS_CATALOG } from "../src/lib/gamification/achievements-catalog";

const prisma = new PrismaClient();

const GAMES = [
  { type: "WOULD_YOU_RATHER" as const, name: "Would You Rather", description: "Pick a side on playful dilemmas.", minPlayers: 2, maxPlayers: 8 },
  { type: "TRIVIA" as const, name: "Trivia", description: "Race to answer trivia questions.", minPlayers: 2, maxPlayers: 8 },
  { type: "GUESS_THE_WORD" as const, name: "Guess the Word", description: "Reveal hints and guess the hidden word.", minPlayers: 2, maxPlayers: 8 },
  { type: "DRAWING_GUESS" as const, name: "Draw & Guess", description: "One player draws, everyone else guesses.", minPlayers: 2, maxPlayers: 8 },
];

const ACHIEVEMENTS = ACHIEVEMENTS_CATALOG;

async function main() {
  for (const game of GAMES) {
    await prisma.game.upsert({
      where: { type: game.type },
      update: { name: game.name, description: game.description },
      create: game,
    });
  }

  for (const achievement of ACHIEVEMENTS) {
    await prisma.achievement.upsert({
      where: { key: achievement.key },
      update: achievement,
      create: achievement,
    });
  }

  console.log(`Seeded ${GAMES.length} games and ${ACHIEVEMENTS.length} achievements.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
