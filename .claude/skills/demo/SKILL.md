---
name: demo
description: Produce a narrated demo video of table that tailored to a specific audience or use case. Uses Playwright MCP to capture real app screenshots, edge-tts for voice narration, and ffmpeg to assemble the final MP4.
---

# Demo Video Producer

## Arguments
$ARGUMENTS — required: a description of who the video is for and what use case to showcase. Examples:
- "children's book author tracking publisher submissions"
- "recruiter managing candidate pipeline"
- "small business owner comparing vendors"
- "student organizing grad school applications"

## Instructions

You are producing a 90-150 second narrated demo video of table that. The video shows real app screenshots with professional voiceover narration, tailored to the audience described in the arguments.

### The Three-Step Formula

Every demo follows this exact formula. This is critical — **never show AI generating fake/sample data**. The value proposition is AI doing real research work.

#### Step 1: BUILD THE TABLE
The user describes what they need. AI designs the schema.
- Chat prompt should be specific about the use case AND request real data. Example: "I write picture books about animals. Build me a list of publishers that accept unsolicited children's manuscripts."
- The prompt should naturally lead to AI researching real entries (not generating samples).

#### Step 2: POPULATE WITH REAL DATA
AI researches and proposes real, actionable entries — not made-up samples.
- After the table is created, the AI should use its knowledge and/or web research to find real entries.
- If the AI offers both "generate sample data" and "research real data" options, ALWAYS choose the research option.
- The populated table should contain **real names, real websites, real details** the user could actually act on.
- This phase may take 30-60 seconds for web research. Use `browser_wait_for` with adequate timeouts.

#### Step 3: ENRICH WITH AI
Add a new column, run for_each_row research to fill it, then sort/filter on the result.
- Ask AI to add a categorization or enrichment column (e.g., "Genre Focus", "Accepts Simultaneous Submissions", "Company Size", "Glassdoor Rating").
- The for_each_row research agent populates this column by researching each row individually.
- Final screenshots show sorting or filtering on this new enriched column.
- This is the killer feature — AI didn't just build the table, it continuously enriches it.

### Tools and paths

```
FFMPEG = r"C:\Users\cliff\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0.1-full_build\bin\ffmpeg.exe"
MAGICK = r"C:\Program Files\ImageMagick-7.1.2-Q16-HDRI\magick.exe"
VOICE  = "en-US-AndrewMultilingualNeural"
```

- edge-tts: `python -m edge_tts` or `import edge_tts` for TTS audio generation
- Playwright MCP: browser_navigate, browser_click, browser_type, browser_take_screenshot, etc.
- Output directory: `_demo/` (frames in `_demo/frames/`, audio in `_demo/audio/`)
- Production URL: https://tablethat.ironcliff.ai
- Dev URL: http://192.168.0.12:5173
- Build script: `_demo/build_video.py` (supports JSON storyboard files)

### Step 1: Write the storyboard

Based on the target audience and the three-step formula, write a storyboard JSON file at `_demo/storyboard-{usecase}.json`. Format:

```json
{
    "output": "table-that-demo-{usecase}.mp4",
    "crossfade": 0.4,
    "closing_narration": "Three steps. Build, populate, enrich. table that. Try it free at table that dot ironcliff dot A I.",
    "closing_tagline": "Build.  Populate.  Enrich.",
    "scenes": [
        {
            "frame": "01_landing.png",
            "narration": "...",
            "pad_before": 0.5,
            "pad_after": 0.8,
            "zoom": null
        }
    ]
}
```

The standard scene flow:

**Intro (2 scenes):**
1. Landing page — introduce table that: "Three steps: build, populate, enrich. Let's see how."
2. Dashboard — AI is ready, just start talking. Don't list manual/CSV as equal options.

**Step 1 — Build the Table (2-3 scenes):**
3. Chat prompt — user types their specific request (tailored to the audience, asks for real data!)
4. Schema proposal — AI designs the table
5. Table created — empty table with columns and filters

**Step 2 — Populate with Real Data (2-3 scenes):**
6. Research in progress — AI researching real entries (show the chat/research panel)
7. Data proposal — AI proposes real, researched entries
8. Table with data — the populated table (first hero shot)

**Step 3 — Enrich with AI (3-4 scenes):**
9. Add column request — user asks AI to add an enrichment column
10. For-each-row research — AI researching each row (show progress)
11. Enriched table — table with the new column filled in (second hero shot)
12. Filtered/sorted view — filter or sort on the enriched column to show actionable insight

**Closing (1 scene):**
13. Closing slide — "tablethat.ironcliff.ai"

**Tailor everything to the audience.** The chat prompts, the enrichment column, and the narration should all speak to the specific use case.

### Step 2: Capture screenshots

Use Playwright MCP to navigate the app (dev URL) and capture each scene:

1. Set browser to 1280x720: `browser_resize(1280, 720)`
2. Make sure light mode is active (check for dark background, toggle if needed)
3. Log out if currently logged in
4. Navigate through the flow, capturing screenshots to `_demo/frames/XX_name.png`
5. For the chat interaction: type the audience-specific prompt, send it, wait for AI response

**Important timing:**
- Schema proposal: 10-20 seconds
- Real data research (Step 2): 30-90 seconds — use `browser_wait_for` with text like "Apply" or check for the data proposal card
- For-each-row enrichment (Step 3): 30-120 seconds depending on row count — watch for completion indicators
- If a response seems stuck after 120 seconds, take a screenshot and note it as a timeout

**Important capture tips:**
- Use `browser_take_screenshot` with absolute paths in `_demo/frames/`
- Register a new throwaway account for each video (e.g., `demo-{usecase}@table.that`)
- After creating the table, hide the chat panel for clean table screenshots (use `browser_run_code` with force click on close button if needed)
- When showing research in progress, capture with the chat/research panel visible
- For the hero shots (populated table, enriched table), hide the chat for a clean view

### Step 3: Build the video

Run the build script with the storyboard JSON:

```
python _demo/build_video.py _demo/storyboard-{usecase}.json
```

The build script handles:
1. **Audio generation** with edge-tts (Andrew Multilingual voice)
2. **Audio caching** — narration text stored in sidecar `.txt` files; only regenerates when text changes
3. **Closing frame** via ImageMagick
4. **Assembly** with ffmpeg: Ken Burns drift on all scenes, crossfade transitions, per-scene timing
5. **Stale cleanup** — removes old audio files if scene count changes

**No need to manually delete audio files.** The sidecar cache detects narration changes automatically.

Or update the `EMBEDDED_SCENES` in `build_video.py` directly and run without arguments.

### Step 4: Report

Tell the user:
- Where the video file is
- Duration and file size
- What scenes are included (with the three steps clearly labeled)
- Offer to tweak narration, swap scenes, or adjust timing

### Voice guidelines

- Keep narration conversational, not salesy
- Say "table that" naturally, no "dot" in the product name
- Refer to the production URL as "table that dot ironcliff dot A I" in speech
- 2-3 sentences per scene max, let the visuals do the work
- Tailor language to the audience (a developer hears "schema", a small business owner hears "columns")
- Emphasize that the data is REAL and RESEARCHED, not generated. Say things like "AI researched real publishers" not "AI created sample entries"
- **NEVER use em dashes, en dashes, or hyphens used as dashes in narration text.** Edge-tts mispronounces them badly. Replace with periods, commas, or restructure the sentence. For example: "AI is ready to go — just start" becomes "AI is ready to go. Just start"

### Output

Final video: `_demo/table-that-demo-{usecase}.mp4`
