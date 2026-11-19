export interface SeedMemberBlueprint {
  full_name: string;
  email: string;
  phone_number: string;
  international_phone: string;
  avatar_url: string;
  env_password_key: string;
  default_password: string;
}

export const REGISTERED_MEMBERS_BLUEPRINT: SeedMemberBlueprint[] = [
  {
    full_name: 'Faraz Ahmed',
    email: 'faraz.maju@gmail.com',
    phone_number: '03332853138',
    international_phone: '923332853138',
    avatar_url: '/assets/aistudio/file_00000000fc648211a8aec61bb7a0ad39_22e5610e.png',
    env_password_key: 'SEED_PASSWORD_FARAZ',
    default_password: 'FarazAhmed',
  },
  {
    full_name: 'Peer Bux',
    email: 'pirbux388@gmail.com',
    phone_number: '0342 3731281',
    international_phone: '923423731281',
    avatar_url: '/assets/aistudio/IMG-20261115-WA0018_30474e23.jpg',
    env_password_key: 'SEED_PASSWORD_PEER_BUX',
    default_password: 'PeerBux',
  },
  {
    full_name: 'Mir Hassan',
    email: 'mirhassan@gmail.com',
    phone_number: '0344 3579010',
    international_phone: '923443579010',
    avatar_url: '/assets/aistudio/IMG-20261115-WA0019_1__1416877d.jpg',
    env_password_key: 'SEED_PASSWORD_MIR_HASSAN',
    default_password: 'MirHassan',
  },
];

export function resolveSeedPassword(member: SeedMemberBlueprint): string {
  const specific = process.env[member.env_password_key]?.trim();
  if (specific) return specific;
  const shared = process.env.SEED_DEFAULT_PASSWORD?.trim();
  if (shared) return shared;
  return member.default_password;
}
