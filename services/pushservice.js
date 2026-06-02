import { Expo } from 'expo-server-sdk';
import PushToken from '../models/pushtoken.js';

const expo = new Expo();

export const sendPushNotifications = async (messageList) => {
 
  const messages = messageList.map(m => ({
    to: m.to,
    sound: 'default',
    title: m.title,
    body: m.body,
    data: m.data || {}
  }));

  const chunks = expo.chunkPushNotifications(messages);
  const tickets = [];
  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
    } catch (err) {
      console.error('Expo push error', err);
    }
  }
  return tickets;
};

export const getPushTokensForStudents = async (studentIds) => {
  const tokens = await PushToken.find({ user: { $in: studentIds } });
  return tokens.map(t => t.token);
};