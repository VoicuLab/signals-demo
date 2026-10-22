# Electrical Engineering · Signal Lab

Browser-only digital strip-chart recorder. All signals are **simulated**, with no connected hardware, model, analytics or external asset dependencies.

Open `dist/index.html` directly, or run `./start.sh` and visit http://localhost:8770/. The launcher binds only to this laptop's loopback address. `.openai/hosting.json` retains the registered private Site identity, but online publication is pending explicit authorization after automatic approval review blocked the source upload.

The source generates 200 samples/second into a bounded 120-second ring buffer. Choose sine, square, triangle or sawtooth waves; adjust frequency, peak voltage and noise. A 20 Ω resistive load gives `I = V / 20` and `P = V × I`. Readings use sampled RMS voltage/current and mean active power. Each plotted channel has its own labeled scale. Voltage is clipped to ±20 V. The fundamental frequency tile reports the source setpoint rather than an estimated measurement.

Pause freezes acquisition and the chart, resume continues the recording timeline, and reset clears history and restores defaults. Hidden tabs pause acquisition until manually resumed. Export downloads the retained samples as CSV, including all three channels regardless of display visibility. Controls are keyboard accessible and the layout adapts to small screens.

This is the initial electrical engineering layout. The requested paper reference picture was not available during implementation; visual matching remains pending that reference.
