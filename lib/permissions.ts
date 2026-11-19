import { isValidObjectId } from './mongodb.ts';

export function assertValidMemberId(id: string, fieldName = 'member ID'): void {
  if (!isValidObjectId(id)) {
    throw new Error(`Invalid ${fieldName}.`);
  }
}

export function assertDistinctMembers(
  firstId: string,
  secondId: string,
  errorMessage = 'You cannot create a financial entry with yourself.'
): void {
  if (firstId === secondId) {
    throw new Error(errorMessage);
  }
}

export function assertUserIsParticipant(
  currentUserId: string,
  participantIds: string[],
  errorMessage = 'You are not authorized to access or modify this record.'
): void {
  if (!participantIds.includes(currentUserId)) {
    throw new Error(errorMessage);
  }
}
