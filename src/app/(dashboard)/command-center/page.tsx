import { getCommandCenterData } from "@/app/actions/get-alerts";
import { CommandCenterClient } from "@/components/command-center/command-center-client";

export default async function CommandCenterPage() {
  const data = await getCommandCenterData();

  return <CommandCenterClient initialData={data} />;
}
