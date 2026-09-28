const ADJECTIVES = [
  "Curious", "Lucky", "Quiet", "Bold", "Gentle", "Swift", "Bright", "Mellow",
  "Clever", "Cosmic", "Drifting", "Electric", "Hidden", "Lunar", "Misty",
  "Nomad", "Quirky", "Solar", "Velvet", "Wandering",
];

const NOUNS = [
  "Fox", "Otter", "Falcon", "Comet", "Wisp", "Lynx", "Heron", "Ember",
  "Raven", "Panda", "Tiger", "Willow", "Aurora", "Pixel", "Nebula",
  "Sparrow", "Harbor", "Cipher", "Maple", "Echo",
];

function randomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

export function generateGuestUsername(): string {
  const adjective = ADJECTIVES[randomInt(ADJECTIVES.length)];
  const noun = NOUNS[randomInt(NOUNS.length)];
  const suffix = 1000 + randomInt(9000);
  return `${adjective}${noun}${suffix}`;
}
