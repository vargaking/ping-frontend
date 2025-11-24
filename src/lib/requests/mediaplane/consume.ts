import { axiosClient } from '../axiosClient';

export const consume = async (recvTransport, producerID) => {
	const response = await axiosClient.post('/test/consume', {
		transportId: recvTransport.id,
		producerID: producerID
	});

	return response.data;
};
