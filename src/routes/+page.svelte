<script lang="ts">
	import { ArrowRight } from 'lucide-svelte';

	const roadmap = [
		{
			tier: 'Now',
			note: 'live',
			dot: 'now',
			items: [{ label: 'Text channels' }, { label: 'Voice channels' }, { label: 'Direct messages' }]
		},
		{
			tier: 'Next up',
			note: 'in progress',
			dot: 'next',
			items: [
				{ label: 'A cleaner, calmer interface' },
				{ label: 'Solid login & registration' },
				{
					label: 'Richer messaging',
					detail: 'edit, delete, attachments, reactions, unread, typing'
				},
				{ label: 'Voice controls', detail: "mute, deafen, and who's in a call at a glance" },
				{ label: 'Server & member management', detail: 'roles, invites, kicks' }
			]
		},
		{
			tier: 'Later',
			note: 'where this is going',
			dot: 'later',
			items: [
				{ label: 'End-to-end encryption' },
				{ label: 'Desktop & mobile apps' },
				{ label: 'Workspaces', detail: 'personal, work and university, on one account' },
				{ label: 'Self-hosting & custom frontends' },
				{ label: 'An automations / bot API' }
			]
		}
	];
</script>

<svelte:head>
	<title>zeta — chat & voice for your server</title>
</svelte:head>

<div class="min-h-screen w-full bg-background text-foreground">
	<header class="topbar sticky z-10 h-11 border-b border-border">
		<div class="mx-auto flex h-full max-w-[720px] items-center justify-between px-5">
			<span class="font-mono text-sm font-medium tracking-tight">zeta</span>
			<span
				class="rounded-md border border-border bg-card px-2 py-[3px] font-mono text-[11px] tracking-wide text-muted-foreground"
			>
				alpha
			</span>
		</div>
	</header>

	<div class="relative mx-auto flex min-h-[calc(100vh-44px)] max-w-[720px] flex-col px-5 pb-16">
		<div class="glow" aria-hidden="true"></div>

		<section class="relative z-[1] mt-16 sm:mt-24">
			<h1
				class="max-w-[16ch] text-[30px] leading-[1.12] font-semibold tracking-[-0.025em] text-balance sm:text-[38px]"
			>
				A calm home for your server's chat and voice.
			</h1>
			<p class="mt-5 max-w-[44ch] text-base leading-relaxed text-muted-foreground">
				Self-hosted, yours to shape, and quiet by default.
			</p>

			<div class="mt-8 flex flex-wrap gap-3">
				<a
					href="/login/"
					class="group inline-flex h-11 items-center gap-2 rounded-[10px] bg-primary px-5 text-sm font-semibold text-primary-foreground"
				>
					Open app
					<ArrowRight
						class="size-4 transition-transform group-hover:translate-x-0.5"
						strokeWidth={1.75}
					/>
				</a>
				<a
					href="/register"
					class="inline-flex h-11 items-center rounded-[10px] border border-input bg-accent px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent/70"
				>
					Create account
				</a>
			</div>
		</section>

		<section class="relative z-[1] mt-24">
			<h2 class="mb-7 text-xs font-medium tracking-wide text-muted-foreground">Roadmap</h2>
			<div class="rail relative flex flex-col gap-10">
				{#each roadmap as group (group.tier)}
					<div class="relative pl-7">
						<span class="dot dot-{group.dot}" aria-hidden="true"></span>
						<div class="mb-3.5 flex items-baseline gap-2.5">
							<span class="text-[15px] font-semibold tracking-tight">{group.tier}</span>
							<span class="font-mono text-[11px] tracking-wide text-muted-foreground"
								>{group.note}</span
							>
						</div>
						<ul class="flex list-none flex-col gap-2 p-0">
							{#each group.items as item (item.label)}
								<li class="text-[15px] leading-normal text-foreground/90">
									{item.label}{#if item.detail}<span class="text-muted-foreground">
											— {item.detail}</span
										>{/if}
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			</div>
		</section>

		<footer
			class="relative z-[1] mt-auto flex items-center justify-between pt-24 text-xs text-muted-foreground"
		>
			<span class="font-mono">zeta</span>
			<a href="/login/" class="underline-offset-[3px] hover:underline">log in →</a>
		</footer>
	</div>
</div>

<style>
	.topbar {
		top: env(safe-area-inset-top, 0px);
		background: color-mix(in oklab, var(--rail, var(--background)) 80%, transparent);
		backdrop-filter: blur(8px);
	}

	.glow {
		position: absolute;
		top: -80px;
		left: 50%;
		transform: translateX(-50%);
		width: 820px;
		max-width: 140%;
		height: 460px;
		pointer-events: none;
		z-index: 0;
		background: radial-gradient(
			46% 50% at 32% 0%,
			color-mix(in oklab, var(--primary) 13%, transparent),
			transparent 72%
		);
		filter: blur(6px);
	}

	.rail::before {
		content: '';
		position: absolute;
		left: 4px;
		top: 7px;
		bottom: 7px;
		width: 1px;
		background: linear-gradient(var(--border), color-mix(in oklab, var(--border) 30%, transparent));
	}

	.dot {
		position: absolute;
		left: 0;
		top: 4px;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--background);
		box-shadow: 0 0 0 3px var(--background);
	}
	.dot-now {
		background: var(--online, var(--primary));
		box-shadow:
			0 0 0 3px var(--background),
			0 0 0 7px color-mix(in oklab, var(--online, var(--primary)) 16%, transparent);
	}
	.dot-next {
		background: var(--primary);
		box-shadow:
			0 0 0 3px var(--background),
			0 0 0 7px color-mix(in oklab, var(--primary) 14%, transparent);
	}
	.dot-later {
		background: var(--background);
		border: 1.5px solid var(--muted-foreground);
	}
</style>
