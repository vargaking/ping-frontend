import { writable, get } from 'svelte/store';
import * as mediasoupClient from 'mediasoup-client';
import { SocketStore } from './socketStore';
import { UserStore, CurrentServerIdStore } from './userStore';
import { axiosClient } from '../requests/axiosClient';

export interface VoicePeer {
    id: string;
    username: string;
    profile: any;
    isSpeaking: boolean;
}

export interface VoiceState {
    channelId: number | null;
    connected: boolean;
    connecting: boolean;
    peers: Map<string, VoicePeer>; // user_id -> VoicePeer
    micProducer: mediasoupClient.types.Producer | null;
    consumers: Map<string, mediasoupClient.types.Consumer>; // consumer_id -> Consumer
    audioElements: Map<string, HTMLAudioElement>; // consumer_id -> AudioElement
}

const initialState: VoiceState = {
    channelId: null,
    connected: false,
    connecting: false,
    peers: new Map(),
    micProducer: null,
    consumers: new Map(),
    audioElements: new Map()
};

function createVoiceStore() {
    const { subscribe, update, set } = writable<VoiceState>(initialState);

    let device: mediasoupClient.types.Device | null = null;
    let sendTransport: mediasoupClient.types.Transport | null = null;
    let recvTransport: mediasoupClient.types.Transport | null = null;

    return {
        subscribe,
        
        init: async () => {
             // Load device capabilities
             try {
                console.log('Initializing mediasoup device...');
                device = new mediasoupClient.Device();
                const response = await axiosClient.get('/api/media/router_capabilities');
                const routerRtpCapabilities = response.data;
                console.log('Got router capabilities:', routerRtpCapabilities);
                await device.load({ routerRtpCapabilities });
                console.log('Device loaded successfully');
                return true;
             } catch (e) {
                 console.error("Failed to load mediasoup device", e);
                 return false;
             }
        },

        joinVoice: async (channelId: number) => {
            const user = get(UserStore);
            const serverId = get(CurrentServerIdStore);
            if (!user || !serverId) return;

            update(s => ({ ...s, connecting: true }));
            console.log(`Joining voice channel ${channelId}...`);

            if (!device) {
                const success = await voiceStore.init();
                if (!success) {
                    console.error('Device init failed, aborting join');
                    update(s => ({ ...s, connecting: false }));
                    return;
                }
            }

            try {
                // 1. Create Send Transport
                console.log('Creating send transport...');
                const sendTransportData = await axiosClient.post('/api/media/create_transport', { is_sending: true }).then(r => r.data);
                console.log('Send transport data:', sendTransportData);
                
                sendTransport = device!.createSendTransport(sendTransportData);
                
                sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
                    console.log('Send transport connect event');
                    try {
                        await axiosClient.post('/api/media/connect_transport', { transportId: sendTransport!.id, dtlsParameters });
                        callback();
                    } catch (error) {
                        console.error('Send transport connect failed', error);
                        errback(error as Error);
                    }
                });

                sendTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
                    console.log('Send transport produce event');
                    try {
                        const { id } = await axiosClient.post('/api/media/produce', {
                            transportId: sendTransport!.id,
                            kind,
                            rtpParameters
                        }).then(r => r.data);
                        callback({ id });
                    } catch (error) {
                        console.error('Send transport produce failed', error);
                        errback(error as Error);
                    }
                });

                // 2. Create Receive Transport
                console.log('Creating receive transport...');
                const recvTransportData = await axiosClient.post('/api/media/create_transport', { is_sending: false }).then(r => r.data);
                recvTransport = device!.createRecvTransport(recvTransportData);

                recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
                    console.log('Recv transport connect event');
                    try {
                        await axiosClient.post('/api/media/connect_transport', { transportId: recvTransport!.id, dtlsParameters });
                        callback();
                    } catch (error) {
                        console.error('Recv transport connect failed', error);
                        errback(error as Error);
                    }
                });

                // 3. Get User Media and Produce
                console.log('Requesting user media...');
                
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    const errorMsg = "Voice chat requires a secure context (HTTPS or localhost). If you are using an IP address, please switch to localhost or enable HTTPS.";
                    console.error(errorMsg);
                    alert(errorMsg);
                    throw new Error(errorMsg);
                }

                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                console.log('Got user media stream');
                const track = stream.getAudioTracks()[0];
                const producer = await sendTransport.produce({ track });
                console.log('Producer created:', producer.id);
                
                // Speaking detection for own voice
                const audioContext = new AudioContext();
                const mediaStreamSource = audioContext.createMediaStreamSource(stream);
                const analyser = audioContext.createAnalyser();
                analyser.fftSize = 256;
                mediaStreamSource.connect(analyser);
                
                const dataArray = new Uint8Array(analyser.frequencyBinCount);
                
                const checkOwnSpeaking = () => {
                    if (producer.closed) {
                        audioContext.close();
                        return;
                    }
                    
                    analyser.getByteFrequencyData(dataArray);
                    const sum = dataArray.reduce((a, b) => a + b, 0);
                    const average = sum / dataArray.length;
                    const isSpeaking = average > 5; // Lower threshold for detection
                    
                    update(s => {
                        const peer = s.peers.get(user.id.toString());
                        if (peer && peer.isSpeaking !== isSpeaking) {
                            const newPeers = new Map(s.peers);
                            newPeers.set(user.id.toString(), { ...peer, isSpeaking });
                            return { ...s, peers: newPeers };
                        }
                        return s;
                    });
                    
                    requestAnimationFrame(checkOwnSpeaking);
                };
                
                checkOwnSpeaking();
                
                // Add self to peers
                update(s => {
                    const newPeers = new Map(s.peers);
                    newPeers.set(user.id.toString(), {
                        id: user.id.toString(),
                        username: user.username + ' (You)',
                        profile: user.profile || {},
                        isSpeaking: false
                    });
                    return { ...s, micProducer: producer, connected: true, connecting: false, channelId, peers: newPeers };
                });

                // 4. Signal Join to WS
                const socket = get(SocketStore);
                 // @ts-ignore
                socket.sendSignal({
                    type: 'join_voice',
                    user_id: user.id,
                    server_id: serverId,
                    channel_id: channelId,
                    rtpCapabilities: device!.rtpCapabilities
                });

                // 5. Notify others about our producer
                console.log('Sending producer_created signal for producer:', producer.id);
                 // @ts-ignore
                socket.sendSignal({
                    type: 'producer_created',
                    user_id: user.id,
                    server_id: serverId,
                    channel_id: channelId,
                    producer_id: producer.id
                });

            } catch (err) {
                console.error("Error joining voice:", err);
                update(s => ({ ...s, connecting: false }));
            }
        },

        leaveVoice: () => {
            const state = get(voiceStore);
            if (state.micProducer) state.micProducer.close();
            if (sendTransport) sendTransport.close();
            if (recvTransport) recvTransport.close();
            
            // Clean up audio elements
            state.audioElements.forEach((audio, id) => {
                audio.pause();
                audio.srcObject = null;
                audio.remove(); // Remove from DOM
            });
            
            // Signal leave
            const socket = get(SocketStore);
            const user = get(UserStore);
            const serverId = get(CurrentServerIdStore);
             // @ts-ignore
            if (socket && user && state.channelId) {
                 // @ts-ignore
                socket.sendSignal({
                    type: 'leave_voice',
                    user_id: user.id,
                    server_id: serverId,
                    channel_id: state.channelId
                });
            }

            set(initialState);
        },

        handleSignal: async (message: any) => {
            if (!device) return;

            console.log('Voice signal received:', message.type, message);

            switch (message.type) {
                case 'voice_participants':
                    // Populate existing participants when joining
                    update(s => {
                        const newPeers = new Map(s.peers);
                        for (const participant of message.participants) {
                            newPeers.set(participant.id.toString(), {
                                id: participant.id.toString(),
                                username: participant.username,
                                profile: participant.profile,
                                isSpeaking: false
                            });
                        }
                        return { ...s, peers: newPeers };
                    });
                    break;

                case 'user_joined_voice':
                    const currentUser = get(UserStore);
                    // Don't add yourself again
                    if (message.user_id !== currentUser?.id) {
                        update(s => {
                            const newPeers = new Map(s.peers);
                            newPeers.set(message.user_id.toString(), {
                                id: message.user_id.toString(),
                                username: message.user?.username || 'Unknown',
                                profile: message.user?.profile || {},
                                isSpeaking: false
                            });
                            return { ...s, peers: newPeers };
                        });
                    }
                    break;
                
                case 'user_left_voice':
                    update(s => {
                        const newPeers = new Map(s.peers);
                        newPeers.delete(message.user_id.toString());
                        return { ...s, peers: newPeers };
                    });
                    break;

                case 'new_producer':
                    const { producerId, userId } = message;
                    console.log('New producer signal:', producerId, 'from user:', userId);
                    await voiceStore.consume(producerId, userId);
                    break;
            }
        },
        
        consume: async (producerId: string, userId: string) => {
            if (!recvTransport) {
                console.error('No recv transport available');
                return;
            }
            
            console.log('Starting consume for producer:', producerId, 'user:', userId);
            
            const { rtpCapabilities } = device!;
            
            const data = await axiosClient.post('/api/media/consume', {
                transportId: recvTransport.id,
                producerId,
                rtpCapabilities
            }).then(r => r.data);
            
            console.log('Consumer data received:', data);
            
            const consumer = await recvTransport.consume(data);
            console.log('Consumer created:', consumer.id, 'track:', consumer.track);
            
            // Resume if needed (server starts paused)
            try {
                await axiosClient.post('/api/media/resume_consumer', { consumerId: consumer.id });
                console.log('✅ Resumed consumer:', consumer.id);
            } catch (e) {
                console.error('❌ Failed to resume consumer:', e);
            }
            
            const stream = new MediaStream([consumer.track]);
            const audio = new Audio();
            audio.srcObject = stream;
            audio.volume = 1.0;
            audio.autoplay = true;
            audio.id = `voice-audio-${userId}`;
            
            // IMPORTANT: Attach to DOM for some browsers to play
            document.body.appendChild(audio);
            
            console.log('Audio element created and attached to DOM, attempting play...');
            audio.play()
                .then(() => console.log('✅ Audio playing for user:', userId))
                .catch(e => {
                    console.error('❌ Audio play failed:', e);
                    // Try with muted first (autoplay policy workaround)
                    audio.muted = true;
                    audio.play().then(() => {
                        console.log('Playing muted, now unmuting...');
                        audio.muted = false;
                    });
                });
            
            update(s => {
                const newConsumers = new Map(s.consumers);
                newConsumers.set(consumer.id, consumer);
                const newAudio = new Map(s.audioElements);
                newAudio.set(consumer.id, audio);
                return { ...s, consumers: newConsumers, audioElements: newAudio };
            });

            // Speaking detection
            const audioContext = new AudioContext();
            const mediaStreamSource = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            mediaStreamSource.connect(analyser);
            
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            
            console.log('Setting up speaking detection for user:', userId);
            
            const checkSpeaking = () => {
                if (consumer.closed) {
                    console.log('Consumer closed, stopping speaking detection for user:', userId);
                    audioContext.close();
                    return;
                }
                
                analyser.getByteFrequencyData(dataArray);
                const sum = dataArray.reduce((a, b) => a + b, 0);
                const average = sum / dataArray.length;
                const isSpeaking = average > 5; // Lower threshold
                
                // Log first detection
                if (isSpeaking) {
                    console.log(`🎤 User ${userId} is speaking (level: ${average.toFixed(2)})`);
                }
                
                update(s => {
                    const peer = s.peers.get(userId);
                    if (peer && peer.isSpeaking !== isSpeaking) {
                        const newPeers = new Map(s.peers);
                        newPeers.set(userId, { ...peer, isSpeaking });
                        return { ...s, peers: newPeers };
                    }
                    return s;
                });
                
                requestAnimationFrame(checkSpeaking);
            };
            
            checkSpeaking();
        }
    };
}

export const voiceStore = createVoiceStore();
