import { html, Component, apiCall } from "../app.js";

const POLL_INTERVAL_MS = 1500;

// TCP flag letters -> human-readable names (used when tcpdump prints Flags [...])
const TCP_FLAG_NAMES = {
  S: "SYN",
  ".": "ACK",
  P: "PSH",
  F: "FIN",
  R: "RST",
  U: "URG",
  E: "ECE",
  W: "CWR",
};

const PROTO_COLORS = {
  TCP: "#5a9bd6",
  UDP: "#b47fd6",
  MDNS: "#6fc46f",
  DNS: "#6fc46f",
  ICMP: "#d69a5a",
  ICMP6: "#d69a5a",
  ARP: "#8a8a8a",
  IGMP: "#c9a86c",
  ETH: "#8a8a8a",
  UNKNOWN: "#8a8a8a",
};

// Splits "192.168.1.5.54321" -> { host: "192.168.1.5", port: "54321" }
// Only splits off the trailing segment if it's numeric (a port), since
// IPv6 addresses also use dots in tcpdump's flow-label format ("fe80::1.5353").
function splitHostPort(token) {
  const lastDot = token.lastIndexOf(".");
  if (lastDot === -1) return { host: token, port: null };
  const maybePort = token.slice(lastDot + 1);
  if (/^\d+$/.test(maybePort)) {
    return { host: token.slice(0, lastDot), port: maybePort };
  }
  return { host: token, port: null };
}

// Deterministically maps a host string (IP or MAC, port stripped) to a stable,
// readable color. Same host always gets the same color for the life of the page.
const hostColorCache = new Map();

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getColorForHost(host) {
  if (!host) return "#8a8a8a";
  if (hostColorCache.has(host)) return hostColorCache.get(host);
  const hue = hashString(host) % 360;
  const color = `hsl(${hue}, 65%, 65%)`;
  hostColorCache.set(host, color);
  return color;
}

// Parses the part of a line AFTER any leading timestamp has been stripped.
// Returns a packet descriptor, or null if this fragment isn't a recognizable
// packet on its own (e.g. it's just a header line like "IP (tos 0x0, ..., length 68)"
// with the actual src/dst on the next line, or an option/hexdump continuation).
function parseRest(rest) {
  // ARP, e.g. "ARP, Ethernet (len 6), IPv4 (len 4), Request who-has 192.168.12.1 tell 192.168.12.27, length 28"
  const arpMatch = rest.match(
    /^ARP,\s*(?:Ethernet \(len \d+\),\s*IPv4 \(len \d+\),\s*)?(Request|Reply)\s+(.*?),?\s*length (\d+)$/
  );
  if (arpMatch) {
    const [, kind, body, length] = arpMatch;
    return {
      protocol: "ARP",
      src: null,
      dst: null,
      length,
      flags: null,
      summary: `${kind === "Request" ? "Who has" : "Reply"} ${body}`,
    };
  }

  // Raw Ethernet/LLC frame with no IP payload decoded, e.g.
  // "32:af:9c:78:f2:a4 > ff:ff:ff:ff:ff:ff Null Unnumbered, xid, Flags [Response], length 6: 01 00"
  const macMatch = rest.match(
    /^([0-9a-fA-F]{2}(?::[0-9a-fA-F]{2}){5})\s+>\s+([0-9a-fA-F]{2}(?::[0-9a-fA-F]{2}){5})\s+(.*)$/
  );
  if (macMatch) {
    const [, src, dst, details] = macMatch;
    const lengthMatch = details.match(/length (\d+)/);
    return {
      protocol: "ETH",
      src,
      dst,
      length: lengthMatch ? lengthMatch[1] : null,
      flags: null,
      summary: details.split(",")[0],
    };
  }

  // Generic "SRC > DST: details" — covers IP, IP6, and bare "host > host: proto" lines,
  // whether they're a full single-line packet or the continuation line under a header.
  const genMatch = rest.match(/([\w.:]+)\s+>\s+([\w.:]+):\s*(.*)$/);
  if (!genMatch) return null;

  const [, srcRaw, dstRaw, details] = genMatch;
  const src = splitHostPort(srcRaw);
  const dst = splitHostPort(dstRaw);
  const lengthMatch = details.match(/length (\d+)/);
  const length = lengthMatch ? lengthMatch[1] : null;

  let protocol = "UNKNOWN";
  let summary = details;
  let flags = null;

  if (/^UDP/.test(details)) {
    if (src.port === "5353" || dst.port === "5353") {
      protocol = "MDNS";
      summary = "mDNS message";
    } else if (src.port === "53" || dst.port === "53") {
      protocol = "DNS";
      summary = "DNS message";
    } else {
      protocol = "UDP";
      summary = "UDP packet";
    }
  } else if (/^tcp\s+\d+/.test(details)) {
    // Short-form verbose TCP: "tcp 0" / "tcp 227" (payload byte count, no flags shown)
    protocol = "TCP";
    const bytes = parseInt(details.match(/^tcp\s+(\d+)/)[1], 10);
    summary = bytes > 0 ? `data ${bytes}B` : "ACK / no payload";
  } else if (/Flags \[/.test(details)) {
    // Standard-form TCP: "Flags [S], seq 123, ..."
    protocol = "TCP";
    const flagsMatch = details.match(/Flags \[([^\]]+)\]/);
    flags = flagsMatch
      ? flagsMatch[1].split("").map((f) => TCP_FLAG_NAMES[f] || f).join(",")
      : null;
    const seqMatch = details.match(/seq (\d+(?::\d+)?)/);
    const ackMatch = details.match(/ack (\d+)/);
    const parts = [];
    if (seqMatch) parts.push(`seq ${seqMatch[1]}`);
    if (ackMatch) parts.push(`ack ${ackMatch[1]}`);
    summary = parts.join(", ") || "TCP segment";
  } else if (/ICMP6/.test(details)) {
    protocol = "ICMP6";
    const clause = details.split("ICMP6,").pop().split(",")[0].trim();
    summary = clause || "ICMPv6 message";
  } else if (/ICMP\b/.test(details)) {
    protocol = "ICMP";
    summary = details.split(",")[0];
  } else if (/^igmp/i.test(details)) {
    protocol = "IGMP";
    summary = "IGMP message";
  }

  return {
    protocol,
    src: src.port ? `${src.host}:${src.port}` : src.host,
    dst: dst.port ? `${dst.host}:${dst.port}` : dst.host,
    length,
    flags,
    summary,
  };
}

// Walks the raw line buffer and emits one row per recognizable packet.
// Handles both:
//  - old single-line-per-packet format ("HH:MM:SS.ffffff IP SRC > DST: details")
//  - verbose multi-line format (a header line with no src/dst, followed by one
//    or more indented continuation lines that carry the actual "SRC > DST: details")
// The timestamp from the most recent header line is applied to every packet
// found until the next timestamp appears — continuation lines don't carry their
// own timestamp, so packets grouped under one header line will show the same time.
function buildRows(lines) {
  const rows = [];
  let currentTime = "";

  for (let i = 0; i < lines.length; i++) {
    const trimmed = (lines[i] || "").trim();
    if (!trimmed) continue;

    if (/^\[stderr\]/.test(trimmed)) {
      rows.push({ key: i, type: "system", text: trimmed.replace(/^\[stderr\]\s*/, "") });
      continue;
    }

    const tsMatch = trimmed.match(/^(?:\d{4}-\d{2}-\d{2}\s+)?(\d{2}:\d{2}:\d{2}\.\d+)\s+(.*)$/);
    const rest = tsMatch ? tsMatch[2] : trimmed;
    if (tsMatch) currentTime = tsMatch[1];

    const parsed = parseRest(rest);
    if (parsed) {
      rows.push({ key: i, type: "packet", time: currentTime, ...parsed });
    }
    // Header-only lines (no src/dst on them) and option/hexdump continuations
    // don't produce a row — they carry no info worth showing on their own.
  }

  return rows;
}

function TcpdumpRow({ row }) {
  if (row.type === "system") {
    return html`<div class="tcpdump-line tcpdump-line-system">${row.text}</div>`;
  }

  const protoColor = PROTO_COLORS[row.protocol] || PROTO_COLORS.UNKNOWN;
  const srcColor = getColorForHost(row.src);
  const dstColor = getColorForHost(row.dst);

  return html`
    <div class="tcpdump-row">
      <span class="tcpdump-time">${row.time}</span>
      <span class="tcpdump-badge" style="background:${protoColor}">${row.protocol}</span>
      ${row.src
        ? html`
            <span class="tcpdump-flow">
              <span class="tcpdump-host" style="color:${srcColor}">${row.src}</span>
              <span class="tcpdump-arrow">→</span>
              <span class="tcpdump-host" style="color:${dstColor}">${row.dst}</span>
            </span>
          `
        : ""}
      <span class="tcpdump-summary">${row.summary}</span>
      ${row.flags ? html`<span class="tcpdump-flags">[${row.flags}]</span>` : ""}
      ${row.length ? html`<span class="tcpdump-length">${row.length}B</span>` : ""}
    </div>
  `;
}

export class Tcpdump extends Component {
  state = {
    iface: "",
    sessionId: null,
    lines: [],
    startTime: null,
    running: false,
    loading: false,
    error: null,
    since: 0,
  };

  componentDidMount() {
    const iface = this.props.iface || "";
    this.setState({ iface });

    if (iface) {
      this.startTcpdump(iface);
    }

    this._interval = setInterval(() => this.pollOutput(), POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", this.handleVisibility);
  }

  componentWillUnmount() {
    clearInterval(this._interval);
    document.removeEventListener("visibilitychange", this.handleVisibility);
    if (this.state.sessionId) {
      apiCall("tcpdumpStop", { id: this.state.sessionId }).catch(() => {});
    }
  }

  handleVisibility = () => {
    if (document.hidden) {
      clearInterval(this._interval);
      this._interval = null;
    } else if (!this._interval) {
      this.pollOutput();
      this._interval = setInterval(() => this.pollOutput(), POLL_INTERVAL_MS);
    }
  };

  startTcpdump(iface) {
    this.setState({ loading: true, error: null, since: 0 });
    apiCall("tcpdumpStart", { interface: iface })
      .then((data) => {
        if (data.ok && data.result && data.result.ok) {
          this.setState({ sessionId: data.result.id, running: true, loading: false, startTime: Date.now() });
        } else {
          this.setState({ loading: false, error: (data.result && data.result.error) || data.error || "failed to start" });
        }
      })
      .catch((err) => this.setState({ loading: false, error: String(err) }));
  }

  stopTcpdump() {
    const { sessionId } = this.state;
    if (!sessionId) return;
    apiCall("tcpdumpStop", { id: sessionId })
      .then(() => this.setState({ running: false, sessionId: null }))
      .catch(() => {});
  }

  pollOutput() {
    const { sessionId, since } = this.state;
    if (!sessionId) return;
    apiCall("tcpdumpOutput", { id: sessionId, since })
      .then((data) => {
        if (data.result && data.result.lines) {
          this.setState((prev) => ({
            lines: [...prev.lines, ...data.result.lines.filter((l) => !prev.lines.includes(l))],
            since: Date.now(),
          }));
        }
      })
      .catch(() => {});
  }

  render(_, { iface, sessionId, lines, startTime, running, loading, error }) {
    const timeStr = startTime ? new Date(startTime).toLocaleTimeString() : "";
    const rows = buildRows(lines);

    return html`
      <div class="card">
        <h2>tcpdump: ${iface || "no interface"}</h2>
        <div class="ap-info">
          ${running
            ? html`<span style="color: #6fc46f;">● Live</span> since ${timeStr} | ${rows.filter((r) => r.type === "packet").length} packets`
            : !loading
              ? html`<span style="color: #8a8a8a;">○ Stopped</span>`
              : html`<span style="color: #c9a86c;">● Starting...</span>`}
        </div>
        ${error && html`<div class="ap-info" style="color: #c96a5a;">Error: ${error}</div>`}
        <div class="tcpdump-toolbar">
          ${running
            ? html`<button class="btn danger" onClick=${() => this.stopTcpdump()}>Stop</button>`
            : html`<button class="btn" onClick=${() => this.startTcpdump(iface)}>Start</button>`}
          ${sessionId && html`
            <button class="btn" onClick=${() => { this.setState({ lines: [], since: 0 }); }}>Clear</button>
          `}
        </div>
        <div class="tcpdump-output">
          ${rows.length === 0
            ? html`<div class="ap-info">Waiting for packets...</div>`
            : rows.map((row) => html`<${TcpdumpRow} key=${row.key} row=${row} />`)}
        </div>
      </div>
    `;
  }
}