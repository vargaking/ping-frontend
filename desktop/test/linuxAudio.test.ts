import assert from 'node:assert/strict';
import test from 'node:test';
import {
	createLinuxAudio,
	linkData,
	ownAudioPids,
	REASONS,
	type LinkData,
	type ProcessInfo,
	type Venmic
} from '../src/linuxAudio.ts';

function fakeVenmic({ pipeWire = true, linkResult = true } = {}) {
	const calls = { link: [] as LinkData[], unlink: 0, constructed: 0 };
	const venmic: Venmic = {
		PatchBay: class {
			constructor() {
				calls.constructed++;
			}
			link(data: LinkData) {
				calls.link.push(data);
				return linkResult;
			}
			unlink() {
				calls.unlink++;
			}
			static hasPipeWire() {
				return pipeWire;
			}
		}
	};
	return { venmic, calls };
}

const processes: ProcessInfo[] = [
	{ pid: 100, type: 'Browser' },
	{ pid: 101, type: 'Tab' },
	{
		pid: 102,
		type: 'Utility',
		name: 'Network Service',
		serviceName: 'network.mojom.NetworkService'
	},
	{ pid: 103, type: 'Utility', name: 'Audio Service', serviceName: 'audio.mojom.AudioService' }
];

function audioWith(venmic: Venmic | Error, list = processes) {
	return createLinuxAudio({
		load: () => {
			if (venmic instanceof Error) throw venmic;
			return venmic;
		},
		processes: () => list,
		appNames: () => ['Zet']
	});
}

test('a missing or broken module says it could not be loaded', () => {
	const audio = audioWith(new Error('Cannot find module'));
	const expected = { ok: false, reason: REASONS.noModule };
	assert.deepEqual(audio.status(), expected);
	assert.deepEqual(audio.start(), expected);
});

test('no PipeWire says so and links nothing', () => {
	const { venmic, calls } = fakeVenmic({ pipeWire: false });
	const audio = audioWith(venmic);
	const expected = { ok: false, reason: REASONS.noPipeWire };
	assert.deepEqual(audio.status(), expected);
	assert.deepEqual(audio.start(), expected);
	assert.equal(calls.link.length, 0);
});

test('a link that venmic refuses is reported', () => {
	const { venmic } = fakeVenmic({ linkResult: false });
	assert.deepEqual(audioWith(venmic).start(), { ok: false, reason: REASONS.linkFailed });
});

test('start links everything except Zet and stop unlinks', () => {
	const { venmic, calls } = fakeVenmic();
	const audio = audioWith(venmic);
	assert.deepEqual(audio.status(), { ok: true });
	assert.deepEqual(audio.start(), { ok: true });
	assert.deepEqual(calls.link, [linkData({ pids: [103], names: ['Zet'] })]);
	audio.stop();
	assert.equal(calls.unlink, 1);
});

test('stop twice, or without a start, unlinks at most once', () => {
	const { venmic, calls } = fakeVenmic();
	const audio = audioWith(venmic);
	audio.stop();
	audio.start();
	audio.stop();
	audio.stop();
	assert.equal(calls.unlink, 1);
});

test('starting again reuses the connection to PipeWire', () => {
	const { venmic, calls } = fakeVenmic();
	const audio = audioWith(venmic);
	audio.start();
	audio.stop();
	audio.start();
	assert.equal(calls.constructed, 1);
	assert.equal(calls.link.length, 2);
});

test('link data leaves out the app by process id first and by name as a fallback', () => {
	assert.deepEqual(linkData({ pids: [7, 8], names: ['Zet'] }), {
		exclude: [
			{ 'application.process.id': '7' },
			{ 'application.process.id': '8' },
			{ 'application.name': 'Zet' }
		],
		ignore_devices: true,
		only_speakers: true,
		only_default_speakers: true,
		mute: false
	});
	assert.equal('include' in linkData({ pids: [7], names: [] }), false);
});

test('the audio service is the process that is left out', () => {
	assert.deepEqual(ownAudioPids(processes), [103]);
});

test('without an audio service process every app process is left out', () => {
	assert.deepEqual(ownAudioPids(processes.slice(0, 3)), [100, 101, 102]);
});
