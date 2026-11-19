import { ArrowRight, Mail, Phone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import type { DirectionalPairBalance, MemberPairCardSummary } from '../../types/index.ts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { MemberAvatar } from '../components/ui/member-avatar.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { formatPKR } from '../lib/utils.ts';

interface MembersDirectoryResponse {
  other_members: MemberPairCardSummary[];
  all_members: MemberPairCardSummary[];
  directional_balances: DirectionalPairBalance[];
}

export function MembersPage() {
  const { user } = useAuth();
  const [data, setData] = useState<MembersDirectoryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<MembersDirectoryResponse>('/api/members')
      .then(setData)
      .catch((err) => toast.error(err?.message ?? 'Failed to load members.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Circle Members
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          All three registered accounts. Opposite-direction debts are maintained as separate records.
        </p>
      </div>

      {/* Counterparty Members (The other 2 friends shown separately) */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Your Friends ({data.other_members.length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {data.other_members.map((item) => (
            <Link
              key={item.member.id}
              to={`/members/${item.member.id}`}
              className="group block focus:outline-none"
            >
              <Card className="h-full transition-colors group-hover:border-emerald-600/60 dark:group-hover:border-emerald-500/60">
                <CardContent className="p-5 space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <MemberAvatar
                        name={item.member.full_name}
                        avatarUrl={item.member.avatar_url}
                        size="lg"
                      />
                      <div className="min-w-0">
                        <p className="font-display text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                          {item.member.full_name}
                        </p>
                        <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          <Mail className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{item.member.email}</span>
                        </p>
                        <p className="flex items-center gap-1.5 font-mono text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          <Phone className="w-3.5 h-3.5 shrink-0" />
                          <span>{item.member.phone_number}</span>
                        </p>
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 shrink-0">
                      <span>Profile</span>
                      <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>

                  {/* Separate Pair Standing */}
                  <div className="grid grid-cols-2 gap-4 border-t border-slate-100 dark:border-slate-800 pt-4">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {item.member.full_name} owes you
                      </p>
                      <p className="font-mono text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400 mt-0.5">
                        {formatPKR(item.receivable_from_member_paisa)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        You owe {item.member.full_name}
                      </p>
                      <p
                        className={`font-mono text-lg font-bold tabular-nums mt-0.5 ${
                          item.payable_to_member_paisa > 0
                            ? 'text-red-700 dark:text-red-400'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {formatPKR(item.payable_to_member_paisa)}
                      </p>
                    </div>
                  </div>

                  {/* Member Aggregate Totals */}
                  <div className="grid grid-cols-3 gap-3 border-t border-slate-100 dark:border-slate-800 pt-4 text-xs">
                    <div>
                      <p className="text-slate-500 dark:text-slate-400">Total Given</p>
                      <p className="font-mono font-semibold tabular-nums mt-0.5">
                        {formatPKR(item.member_total_given_paisa)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500 dark:text-slate-400">Total Received</p>
                      <p className="font-mono font-semibold tabular-nums mt-0.5">
                        {formatPKR(item.member_total_received_paisa)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500 dark:text-slate-400">Total Repaid</p>
                      <p className="font-mono font-semibold tabular-nums mt-0.5">
                        {formatPKR(item.member_total_repaid_paisa)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* Complete 3-Member Summary Table (includes current logged-in member) */}
      <Card>
        <CardHeader>
          <CardTitle>All Three Registered Members</CardTitle>
          <CardDescription>
            Click any member to inspect their complete financial profile and transaction history
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-left text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="px-5 py-3">Member</th>
                  <th className="px-4 py-3">Email & WhatsApp</th>
                  <th className="px-4 py-3 text-right">Total Given</th>
                  <th className="px-4 py-3 text-right">Total Received</th>
                  <th className="px-4 py-3 text-right">Total Repaid</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.all_members.map((item) => {
                  const isMe = item.member.id === user?.id;
                  return (
                    <tr
                      key={item.member.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <MemberAvatar
                            name={item.member.full_name}
                            avatarUrl={item.member.avatar_url}
                            size="sm"
                          />
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-slate-100">
                              {item.member.full_name}{' '}
                              {isMe && (
                                <span className="text-xs font-normal text-emerald-700 dark:text-emerald-400">
                                  (You)
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">
                        <p>{item.member.email}</p>
                        <p className="font-mono mt-0.5">{item.member.phone_number}</p>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono tabular-nums">
                        {formatPKR(item.member_total_given_paisa)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono tabular-nums">
                        {formatPKR(item.member_total_received_paisa)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono tabular-nums">
                        {formatPKR(item.member_total_repaid_paisa)}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Link
                          to={`/members/${item.member.id}`}
                          className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap"
                        >
                          Open Profile
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
