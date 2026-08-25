import { MissionControl } from '@/components/desk/mission-control';

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <MissionControl
      guestMode={process.env.LAUNCH_DESK_GUEST_MODE === 'true'}
      planEndpoint={process.env.LAUNCH_DESK_AGENT_ENDPOINT ?? '/api/agent/plan'}
    />
  );
}
