import { activityMessages } from "@/lib/dashboard/homepage-data";

export function DataActivityPanel() {
  return (
    <div className="panel">
      <div className="panel-head"><h2>Live data engine</h2><span className="badge">Simulated</span></div>
      <ul>{activityMessages.map((message) => <li key={message}><span>{message}</span><strong>now</strong></li>)}</ul>
    </div>
  );
}
