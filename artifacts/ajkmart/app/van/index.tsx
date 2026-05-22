import React from "react";
import { withServiceGuard } from "@/components/ServiceGuard";
import { withErrorBoundary } from "@/utils/withErrorBoundary";

const VanScreen = React.lazy(() => import("./_Screen"));
export default withErrorBoundary(withServiceGuard("van", VanScreen));
