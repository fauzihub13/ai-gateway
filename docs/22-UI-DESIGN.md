# Design and Implement a Premium AI Provider Gateway Website

Design and implement a polished, production-quality website for an **AI Provider Gateway platform** that allows developers to access multiple AI providers and models through a unified API. The platform should support API key management, model discovery, usage analytics, request logs, and billing.

The visual direction must follow the existing **“Making Software” editorial design system**, enhanced with subtle, purposeful 2D and 3D interactive animations. Do not replace the design identity with a generic AI SaaS template.

## 1. Art Direction

Create a bright, clean, editorial-inspired developer platform that feels like a technical publication brought to life.

The interface should communicate:
- Technical precision and engineering credibility.
- Modern AI infrastructure.
- Simplicity across multiple AI providers.
- A distinctive, thoughtful visual identity.
- Professional quality without feeling corporate or generic.

Use a predominantly white and off-white canvas, crisp electric-blue accents, precise technical linework, editorial typography, and generous whitespace.

**The website must remain light-themed. Do not use dark-mode sections as the primary visual direction.**

## 2. Design System

### Color palette

Preserve the existing Making Software palette:

- Primary blue: `#1E4DFF`
- Secondary black: `#000000`
- Tertiary border: `#E5E7EB`
- Neutral background: `#FBFBFB`
- Surface: `#FFFFFF`
- Primary light blue: `#5D7FFF`
- Pale blue: `#D9E2FF`
- Error: `#D92D20`

Use electric blue as the primary accent for interactive elements, diagrams, links, active navigation, and technical annotations.

Use pale blue for diagram fills, hover states, selected model indicators, and subtle visual emphasis.

Do not introduce competing accent colors such as neon green, bright orange, or saturated multicolor gradients. Any additional colors should be rare and functional.

### Typography

Preserve the editorial typography system:

- Display headings: Departure Mono, or a visually similar monospace fallback.
- Reading text: EB Garamond, or a visually similar serif fallback.
- UI labels and controls: clean sans-serif typography.
- Technical annotations: monospaced uppercase labels with subtle letter spacing.

Use large, confident headlines with compact line heights. Keep body text readable, spacious, and editorial.

Load the specified fonts when available and provide appropriate fallbacks.

### Layout and shapes

- Use a fixed maximum-width editorial grid.
- Use asymmetrical two-column layouts where appropriate.
- Place explanatory text on the left and technical visualizations on the right.
- Use generous whitespace and clear horizontal section separators.
- Prefer straight edges, restrained geometry, and small corner radii.
- Use thin borders and linework instead of heavy shadows.
- Avoid excessive rounded cards, oversized pills, and glossy surfaces.
- Keep buttons and form controls compact, crisp, and functional.

The overall design should feel architectural, precise, and print-inspired.

## 3. Signature Feature: Interactive AI Routing Visualization

Create a distinctive interactive hero illustration that represents the gateway routing requests to different AI providers.

The visualization should look like an animated technical blueprint rather than a generic floating AI robot.

Include:
- A central gateway node representing the unified API endpoint.
- Multiple connected provider nodes representing OpenAI, Anthropic, Google, Meta, and other configurable providers.
- Fine electric-blue connection lines with animated request particles.
- Small technical labels, endpoint annotations, and request status indicators.
- Subtle depth through layered SVG illustrations, perspective, or restrained 3D geometry.
- Interactive hover states that highlight a provider and its connection to the gateway.
- A request-routing animation that demonstrates a request traveling from the gateway to a selected provider and returning a response.

Keep the background white or off-white. Use blue linework, pale-blue fills, black typography, and minimal dimensional effects.

The animation should explain the product's function, not exist purely for decoration.

Do not use large glowing spheres, excessive neon, full-screen WebGL effects, or generic AI-generated abstract backgrounds.

## 4. 2D and 3D Motion Direction

Combine restrained 2D motion with optional lightweight 3D elements.

Use 2D SVG animations for:
- Request particles moving along connection lines.
- Provider nodes changing between idle, selected, and active states.
- Blueprint diagrams revealing progressively as the user scrolls.
- Small charts and technical annotations appearing with subtle transitions.
- Interactive line drawings and connection paths.

Use 3D only where it provides meaningful visual value, such as a small central gateway object or a layered isometric infrastructure illustration.

The 3D treatment should remain minimal, geometric, and consistent with the blueprint aesthetic. Prefer a white or transparent-looking object with crisp blue edges over glossy, colorful, futuristic objects.

Animations must be smooth, lightweight, responsive, and purposeful.

Use hover interactions, scroll-triggered reveals, and small state transitions. Avoid constant movement across the entire page.

Respect `prefers-reduced-motion` and provide static fallbacks for reduced-motion preferences or unsupported devices.

## 5. Landing Page Structure

### Navigation

Create a clean horizontal navigation bar with:

- Product logo and wordmark.
- Models.
- Features.
- Pricing.
- Documentation.
- Sign in.
- A primary “Get API Key” or “Get Started” action.

Keep the navigation light, minimal, and editorial.

### Hero section

Use a spacious asymmetric two-column layout.

Left column:
- A small technical eyebrow label such as `UNIFIED AI PROVIDER GATEWAY`.
- A headline such as “One API. Every AI Model.”
- A short description explaining how developers can access multiple AI providers through a unified API.
- A primary blue CTA: “Get Started”.
- A secondary text or outlined CTA: “Read Documentation”.
- A compact technical endpoint example such as `/v1/chat/completions`.

Right column:
- The interactive AI routing blueprint.
- Provider nodes and animated request particles.
- Compact request-status annotations.
- A subtle grid or technical coordinate system in the background.

The hero should feel memorable and interactive while retaining the calm, spacious character of an editorial website.

### Provider ecosystem

Show supported providers in a restrained, well-aligned row or grid.

Use actual provider logos where permitted. Keep provider names readable and avoid turning this section into a wall of colorful logos.

Hovering over a provider may highlight its node in the routing visualization.

Only display providers and capabilities that the actual backend supports.

### Product features

Present core benefits in an editorial grid with thin dividers rather than a collection of large floating cards.

Feature examples:
- Unified API access.
- Model selection and routing.
- Centralized API key management.
- Usage and cost analytics.
- Request monitoring and logs.
- Billing and usage limits.

Each feature should have a concise description and a custom technical SVG illustration, small animated diagram, or annotated interface preview.

### Interactive request playground

Create a lightweight interactive section that demonstrates how a request passes through the gateway.

Include:
- A code panel showing an API request.
- A selectable example model when supported by the available backend.
- An animated request path.
- A response preview.
- A status indicator and sample latency.

Use realistic sample data only when the demonstration is explicitly marked as simulated. Do not claim that a simulated request is a real API request.

### Model catalog preview

Display a compact preview of the available models with:
- Model name.
- Provider.
- Supported capabilities.
- Input and output pricing when available.
- A link to view the full catalog.

Use a clean table or editorial list with thin borders and compact technical labels.

Do not invent model availability, prices, context windows, or capabilities.

### Usage and analytics preview

Show a light-themed dashboard preview with:
- Request volume.
- Token consumption.
- Estimated cost.
- Provider distribution.
- Request status and latency.

Use restrained blue charts and subtle animations.

Clearly distinguish illustrative sample metrics from live backend data.

### Final CTA

Finish with a spacious, editorial CTA section.

Suggested headline: “One endpoint. Your entire AI stack.”

Include a short supporting sentence and a clear CTA to create an API key or read the documentation.

Use a technical line illustration or small routing animation as the visual accent.

## 6. Authenticated Dashboard

The dashboard must use the same light theme and editorial identity as the landing page.

Use:
- White and off-white backgrounds.
- Black text.
- Electric-blue active states.
- Thin gray borders.
- Compact controls.
- Clear data hierarchy.
- Subtle transitions rather than decorative animation.

Suggested sidebar navigation:

- Overview.
- API Keys.
- Models.
- Usage.
- Request Logs.
- Billing.
- Settings.

The overview should prioritize actionable information:
- Current usage or balance, depending on the billing model.
- Total requests.
- Token consumption.
- Cost.
- Usage trends.
- Recent API activity.
- Provider availability, if supported by real monitoring data.

Use tables for operational data and charts for trends. Avoid excessive cards and unnecessary empty space inside data-heavy dashboard pages.

Animations should be limited to chart transitions, loading states, hover feedback, and meaningful status changes.

## 7. Component Behavior

Implement real, accessible UI behavior rather than static visual mockups.

Include:
- Functional navigation and links.
- Responsive mobile navigation.
- Interactive provider nodes.
- Hover, focus, active, disabled, loading, and error states.
- Search and filtering for model catalogs when data is available.
- Copy-to-clipboard actions for API examples and keys where appropriate.
- Accessible forms and clear validation feedback.
- Skeleton loading states where useful.
- Empty states for accounts without data.
- Error states for failed API calls.

Never display actual API secrets in plain text after their initial creation. Use masked keys and appropriate copy actions.

## 8. Technical Implementation

Use the existing project's framework, conventions, and dependencies wherever possible.

If the project uses Next.js, React, and TypeScript, follow its established architecture.

Recommended tools when appropriate:
- Tailwind CSS for styling.
- shadcn/ui for accessible UI primitives.
- Motion for React animations.
- SVG for interactive routing diagrams.
- React Three Fiber and Three.js only if lightweight 3D genuinely improves the design.
- Recharts or the project's existing charting library for analytics.

Do not install unnecessary animation libraries. Prefer SVG and CSS for most interactions to preserve performance.

Integrate with the existing API gateway backend rather than creating an unrelated mock application. Reuse existing endpoints, authentication, billing rules, model data, and API key workflows.

Inspect the existing codebase before implementing the design. Preserve established project conventions and avoid unrelated refactoring.

## 9. Responsive Design and Performance

Ensure the experience works well on desktop, tablet, and mobile.

On smaller screens:
- Simplify the routing illustration without losing its meaning.
- Reduce or disable expensive 3D effects.
- Maintain readable typography and accessible controls.
- Prevent horizontal overflow.
- Preserve access to important dashboard actions.

Optimize animation performance and avoid blocking initial rendering with large WebGL scenes.

Provide static SVG or CSS fallbacks wherever practical.

## 10. Quality Bar

The final result must not look like a generic AI SaaS template.

Avoid:
- Dark-mode visual direction.
- Excessive purple gradients.
- Neon cyberpunk aesthetics.
- Generic robot mascots.
- Excessive glassmorphism.
- Heavy drop shadows.
- Over-rounded cards.
- Constant floating animations.
- Random decorative blobs.
- Dense, poorly structured dashboards.
- Fake live data presented as real.

Prioritize:
- A distinctive technical editorial identity.
- Electric-blue blueprint illustrations.
- Purposeful interactive 2D/3D motion.
- Crisp typography and generous whitespace.
- Clear information architecture.
- Consistent visual rules across public pages and the dashboard.
- Production-quality interactions and responsive behavior.

Before implementation, inspect the existing project and identify its framework, routing structure, design conventions, and available backend endpoints. Then implement the design in coherent stages, reusing existing functionality wherever possible.

**The goal:** a bright, technically sophisticated AI Provider Gateway that feels like an interactive engineering publication—precise, memorable, and alive, without sacrificing usability or performance.