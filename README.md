# Electrical Engineering · Signal Lab

Local digital strip-chart recorder at **http://localhost:8770/**. No external assets, analytics, remote AI, or connected instrument. The installed `signal-lab.service` serves `dist/` on loopback; restart with `systemctl --user restart signal-lab.service`. This is buildless HTML/ES modules: edit the durable tracked files and refresh. All imports stay in the browser.

## Traces and display

The default paper recorder uses fine cream/pink graph lines, separate channel baselines, live elevation/value labels and independent vertical ranges. Choose paper or dark styling, automatic or fixed ranges, 5/10/20-second windows, and individual channels. Pointer inspection shows the nearest original sample's time, voltage, current and power. Pause freezes acquisition and the chart; hidden tabs pause until manually resumed.

**Instrument trace is explicitly simulated.** At 200 samples/second it adds a varying amplitude envelope, frequency wander, harmonics, adjustable slow baseline drift, correlated/white perturbations, and irregular rising/decaying ringing transients. Trigger transient injects a reproducible pulse and settling response. Voltage is limited to ±20 V. Current follows the exact held-voltage discrete response of an RL load, `L di/dt + R i = V`, with R=20 Ω and L=0.7 H; instantaneous `P=V×I` may become negative as stored inductive energy returns. This is a teaching simulation, not calibrated instrument data, a physiological waveform, or a reproduction of an unavailable reference image. The initial window contains synthetic history for an immediate view.

**Ideal waveform generator** retains sine, square, triangle and sawtooth sources and the original purely resistive `I=V/20`, `P=V×I` relationships. Frequency is a carrier setpoint, not an estimated measurement. Changing source starts a new recording. The generated history is bounded to 24,000 rows (120 seconds at 200 Hz).

## Local recording CSV

Open recording CSV accepts numeric `time_s,voltage_V` headers with optional `current_A,power_W`; order may vary, BOM/CRLF/quoted cells are supported. Timestamps must be finite, nonnegative, strictly increasing and at most 1e12 seconds. Measurements must have magnitude ≤1e100 to keep recorder arithmetic finite. Files are limited to 10 MiB. Every row is validated; the latest 24,000 original rows are retained. Imported data is neither resampled nor authenticated as a real measurement.

Supplied current and power values are preserved. Missing current explicitly uses V/20 Ω; missing power explicitly uses V×I. The interface identifies these assumptions. Imports initially open paused at their last timestamp; Replay streams the retained original samples at their original timing. Generator controls are disabled for CSV. A malformed file leaves the current recording selected and displays a row-specific error.

Measurements show time-weighted RMS voltage/current and mean power using trapezoidal integration over up to the latest five seconds. CSV frequency is not guessed. Export writes the current retained original sample timestamps and values as CSV; filenames distinguish simulated and imported recordings.

## Verification and remaining reference

Focused source checks cover resistive consistency, finite bounded source output, transient response, RL lag/negative instantaneous power, and sine RMS. The strict parser has focused valid/malformed-input and retention checks. Browser checks and screenshots are saved in the existing ignored `outputs/` directory.

The original paper waveform photo is not available in this workspace/chat context. Exact shape, vertical calibration and layout matching remain unverified until that reference is available. No hardware feed is connected. `.openai/hosting.json` retains its existing private Site identity; all current work is local-only, with no publication or source upload.
