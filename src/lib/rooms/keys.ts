export const roomKeys = {
  members: (roomId: string) => `room:members:${roomId}`,
  userRooms: (userId: string) => `room:byUser:${userId}`,
};
