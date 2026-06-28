// 空状态 — 无脚本时的占位提示，取自 Empty State 设计稿

export function EmptyState() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "80px 32px",
        textAlign: "center",
      }}
    >
      <svg
        width="48"
        height="48"
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ color: "var(--text-400)", marginBottom: "20px" }}
        aria-hidden="true"
      >
        <path
          d="M6 24C6 24 10 16 14 16C18 16 18 32 22 32C26 32 26 16 30 16C34 16 38 24 38 24"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p
        style={{
          fontSize: "15px",
          fontWeight: 500,
          color: "var(--text-500)",
          margin: "0 0 6px 0",
        }}
      >
        No script imported yet
      </p>
      <p
        style={{
          fontSize: "13px",
          fontWeight: 400,
          color: "var(--text-400)",
          margin: 0,
        }}
      >
        Import a script to get started
      </p>
    </div>
  )
}
