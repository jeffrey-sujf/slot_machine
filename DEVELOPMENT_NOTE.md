# PocketPulse Development Note

## Core Idea
PocketPulse is a lightweight habit tracker and reward-driven slot machine experience. Users complete daily habits to earn collectible tokens, then insert those tokens into a retro-inspired slot machine to spin for rewards. The app blends productivity with playful gamification, turning completion into immediate visual feedback and mechanical rewards.

## Function
- `app.js` handles state persistence, habit rendering, wallet management, and slot machine behavior.
- Habits are stored in local storage under `pocketpulse_v2` and include completion state and earned token metadata.
- Completing a habit awards a random token, updates the wallet count, and increments lifetime token stats.
- The slot machine uses a combination of token loading and randomized weighted outcomes to simulate different win tiers.
- A modal selects the credit level, deducts tokens from the wallet, and animates token insertion before allowing a spin.
- Spin outcomes are recorded in history and displayed with particle effects and status text.

## Art Style
- Retro-futuristic UI with polished glassy panels and LCD-inspired screens.
- Soft tactile surfaces, rounded corners, and layered shadows create a premium handheld device feel.
- A muted beige/off-white background with bright neon token colors gives contrast and clarity.
- Simple pixel and material iconography keeps the interface readable and playful.

## Animation Style
- Motion is energetic but restrained: short bursts, soft bounces, and clean transitions.
- Habit completion uses a flash effect, coin rain, and token fly-to-wallet animation to reinforce reward delivery.
- Toast notifications slide in and fade out gently to communicate earned tokens without disrupting flow.
- Slot interactions include a token insert flip animation and loaded trigger glow before spins.
- Winning spins use reel scrolling, shake feedback on misses, and particle bursts for wins.

## Development Notes
- Shared script code is used across `habit.html` and `spin.html`, so keep DOM references and helper functions centralized in `app.js`.
- Style definitions in `style.css` should favor composable utility-like selectors and reuse existing animation keyframes when possible.
- New UI behavior should be additive, using existing page structure and minimal new markup.
- Future improvements can include backend sync, real token selection for slot credits, and a dedicated wallet page with token detail.
