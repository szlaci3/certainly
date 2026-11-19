# Certainly

Certainly is a 3D material playground you can explore in your browser. Its world has just two surfaces: a floor beneath you and a ceiling overhead. Each repeats its own texture into the distance. Walk across a wooden floor under a marble ceiling, then swap either surface and watch it fade into the next.

[Open Certainly on Netlify](https://certainly.netlify.app/)

## Explore the scene

Use the **arrow keys** to walk forward, backward, or sideways. The **crosshair** means moving the mouse turns the view. Click the scene once to switch to the standard arrow cursor and hold the viewing angle steady. Click the scene again to resume looking around. On phones and tablets, hold the on-screen arrows to walk. Swipe with another finger to look around: drag the scene right to look left, or down to look up.

## Make it your own

Open **Materials** in the bottom dock and choose **Floor** or **Ceiling**. Pick a thumbnail to try wood, brick, marble, grass, or one of the original textures. You can also upload a photo to see how it looks repeated across a surface.

For a custom pattern, open the **Material assistant** and describe what you want, such as “midnight teal marble with thin jade veins.” Antigravity composes a procedural recipe, and your browser renders it into a tile. Your uploads, generated materials, and surface choices are saved in this browser so you can return to the same world later.

## Material generation on Netlify

The site uses TypeScript functions and Netlify Blobs. Python is only needed to rebuild the bundled example textures. Netlify installs the locked npm dependencies, publishes `public/`, and bundles `netlify/functions/`. Set `GEMINI_API_KEY` and a stable random `JOB_TOKEN_SECRET` of at least 32 characters in the Functions environment.

The browser sends a submission key to `POST /api/material` and receives a signed polling handle. A background worker claims the job with a conditional Blobs write, starts one Gemini interaction, and stores its ID. The browser polls the status endpoint for the saved recipe. Repeating a submission with the same key recovers the original job. A lost Gemini start response is terminal for that job because resending it could incur a second charge. Transient provider status errors can be retried safely. Jobs time out after 14 minutes, and polling handles expire after one hour. Job records live in the site store `material-jobs` across function instances and deploys.

Use Node 24 and run `npm ci` followed by `npm test` for local checks. Use `npx netlify-cli dev` to serve the app and functions together.
