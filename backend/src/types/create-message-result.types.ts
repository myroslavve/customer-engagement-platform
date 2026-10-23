import { Message } from '../database/entities/message.entity';

/** created is false when a previous attempt of the same step already inserted the row. */
export type CreateMessageResult = {
  message: Message;
  created: boolean;
};
