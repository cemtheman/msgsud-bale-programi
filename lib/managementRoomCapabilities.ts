export const MANAGEMENT_ROOM_CAPABILITIES = [
  {
    id: 'GENERAL_CLASSROOM_SMALL_GROUP',
    label: 'Genel Derslik (Küçük Grup)',
  },
  {
    id: 'GENERAL_CLASSROOM_LARGE_GROUP',
    label: 'Genel Derslik (Büyük Grup)',
  },
  {
    id: 'STUDIO_SMALL_GROUP',
    label: 'Stüdyo (Küçük Grup)',
  },
  {
    id: 'STUDIO_LARGE_GROUP',
    label: 'Stüdyo (Büyük Grup)',
  },
  {
    id: 'INSTRUMENT_RELATED_CLASSROOM',
    label: 'Enstrüman ilişkili derslik',
  },
] as const;

export type ManagementRoomCapability =
  typeof MANAGEMENT_ROOM_CAPABILITIES[number]['id'];

const MANAGEMENT_ROOM_CAPABILITY_LABELS = Object.fromEntries(
  MANAGEMENT_ROOM_CAPABILITIES.map((item) => [item.id, item.label]),
) as Record<string, string>;

export function managementRoomCapabilityLabel(value: string) {
  return MANAGEMENT_ROOM_CAPABILITY_LABELS[value]
    ?? value
      .replaceAll('_', ' ')
      .toLocaleLowerCase('tr-TR')
      .replace(/^./, (letter) => letter.toLocaleUpperCase('tr-TR'));
}

export function isManagementRoomCapability(
  value: string,
): value is ManagementRoomCapability {
  return MANAGEMENT_ROOM_CAPABILITIES.some((item) => item.id === value);
}
