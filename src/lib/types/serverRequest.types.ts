export type ServerRequestStatus = 'pending' | 'approved' | 'declined' | 'withdrawn';

export type ExpectedSize = 'lt10' | '10to50' | '50plus';

export const EXPECTED_SIZES: { value: ExpectedSize; label: string }[] = [
	{ value: 'lt10', label: 'Under 10' },
	{ value: '10to50', label: '10–50' },
	{ value: '50plus', label: '50+' }
];

export const DESCRIPTION_MAX = 500;
export const DECLINE_REASON_MAX = 500;

export type ServerRequestInput = {
	name: string;
	description: string;
	expected_size: ExpectedSize;
};

export type ServerRequest = ServerRequestInput & {
	id: number;
	status: ServerRequestStatus;
	decline_reason: string | null;
	created_at: string;
	decided_at: string | null;
	server_id: number | null;
};

export type MyServerRequestState = {
	mode: 'open' | 'waitlist';
	can_create: boolean;
	request: ServerRequest | null;
};

export type AdminServerRequest = ServerRequest & {
	requester: { id: number; username: string };
};
