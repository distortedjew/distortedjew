import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const GAMES = [
  { type: "WOULD_YOU_RATHER" as const, name: "Would You Rather", description: "Pick a side on playful dilemmas.", minPlayers: 2, maxPlayers: 8 },
  { type: "TRIVIA" as const, name: "Trivia", description: "Race to answer trivia questions.", minPlayers: 2, maxPlayers: 8 },
  { type: "GUESS_THE_WORD" as const, name: "Guess the Word", description: "Reveal hints and guess the hidden word.", minPlayers: 2, maxPlayers: 8 },
  { type: "DRAWING_GUESS" as const, name: "Draw & Guess", description: "One player draws, everyone else guesses.", minPlayers: 2, maxPlayers: 8 },
];

const ACHIEVEMENTS = [
  { key: "first_conversation", name: "First Contact", description: "Complete your first conversation.", icon: "sparkles", xpReward: 25 },
  { key: "first_connection", name: "New Friend", description: "Make your first mutual connection.", icon: "heart", xpReward: 25 },
  { key: "first_game", name: "Game On", description: "Play your first mini-game.", icon: "gamepad", xpReward: 20 },
  { key: "globe_trotter", name: "Globe Trotter", description: "Meet people from 5 different countries.", icon: "globe", xpReward: 50 },
  { key: "streak_3", name: "Warming Up", description: "Chat on 3 different days in a row.", icon: "flame", xpReward: 30 },
  { key: "streak_7", name: "On a Roll", description: "Chat on 7 different days in a row.", icon: "flame", xpReward: 75 },
];

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
