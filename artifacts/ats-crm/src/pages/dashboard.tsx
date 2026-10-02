import { 
  useGetDashboardStats, 
  useGetSpecialtyBreakdown,
  useGetStateBreakdown,
  useGetPipelineBreakdown,
  useGetWeeklyGrowth,
  useGetRecentActivity
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserPlus, Copy, Upload, Trello } from "lucide-react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area
} from "recharts";

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: specialtyData } = useGetSpecialtyBreakdown();
  const { data: stateData } = useGetStateBreakdown();
  const { data: pipelineData } = useGetPipelineBreakdown();
  const { data: growthData } = useGetWeeklyGrowth();

  const safeSpecialtyData = Array.isArray(specialtyData) ? specialtyData : [];
  const safeStateData = Array.isArray(stateData) ? stateData : [];
  const safePipelineData = Array.isArray(pipelineData) ? pipelineData : [];
  const safeGrowthData = Array.isArray(growthData) ? growthData : [];
  // We'll skip recent activity for brevity or add it if time permits

  if (statsLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading terminal data...</div>;
  }

  const statCards = [
    { title: "Total Candidates", value: stats?.totalCandidates || 0, icon: Users, desc: "All time" },
    { title: "New Today", value: stats?.newToday || 0, icon: UserPlus, desc: "Sourced today" },
    { title: "Active Pipeline", value: stats?.activePipeline || 0, icon: Trello, desc: "In progress" },
    { title: "Resumes Uploaded", value: stats?.resumesUploaded || 0, icon: Upload, desc: "System total" },
    { title: "Duplicates Found", value: stats?.duplicatesFound || 0, icon: Copy, desc: "Pending review" },
  ];

  const COLORS = ['hsl(185, 70%, 35%)', 'hsl(215, 25%, 27%)', 'hsl(199, 89%, 48%)', 'hsl(160, 84%, 39%)', 'hsl(222, 47%, 11%)'];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Command Center</h1>
        <p className="text-muted-foreground">System overview and analytics.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {statCards.map((card, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              <card.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">{card.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Pipeline Distribution</CardTitle>
            <CardDescription>Candidates currently across all active stages.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {safePipelineData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={safePipelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} />
                  <RechartsTooltip cursor={{ fill: 'hsl(var(--muted))' }} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No data available</div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Top Specialties</CardTitle>
            <CardDescription>Breakdown by discipline.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
             {safeSpecialtyData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={safeSpecialtyData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="count"
                    nameKey="label"
                  >
                    {safeSpecialtyData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
             ) : (
               <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No data available</div>
             )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>State Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-[250px]">
            {safeStateData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={safeStateData.slice(0, 5)} layout="vertical" margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis dataKey="label" type="category" fontSize={12} tickLine={false} axisLine={false} />
                  <RechartsTooltip cursor={{ fill: 'hsl(var(--muted))' }} />
                  <Bar dataKey="count" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
               <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No data available</div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Candidate Growth</CardTitle>
          </CardHeader>
          <CardContent className="h-[250px]">
            {safeGrowthData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={safeGrowthData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="week" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} />
                  <RechartsTooltip />
                  <Area type="monotone" dataKey="count" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorCount)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
               <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No data available</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
