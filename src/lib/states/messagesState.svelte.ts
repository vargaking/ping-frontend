import type { MessageType } from '$lib/types/messages.types';

class MessagesState {
	messages: MessageType[] = $state([]);

	set(messages: MessageType[]) {
		this.messages = messages;
	}

	clear() {
		this.messages = [];
	}

	addMessage(message: MessageType) {
		this.messages.push(message);
	}
}

export const messagesState = new MessagesState();
