'use client';

import { useMemo, useState } from 'react';
import type {
  ManagementSolverObjectiveKey,
  ManagementSolverObjectiveProfile,
  ManagementSolverObjectiveWeights,
  ManagementSolverProfileInput,
  ManagementSolverProfileStatus,
  ManagementSolverWorkspace,
} from '@/lib/managementSolver';

const PRIORITY_LEVELS = [
  { value: 0, label: 'Kapalı' },
  { value: 250, label: 'Düşük' },
  { value: 500, label: 'Orta' },
  { value: 750, label: 'Yüksek' },
  { value: 1000, label: 'Çok yüksek' },
] as const;

const EMPTY_WEIGHTS: ManagementSolverObjectiveWeights = {
  changeCost: 0,
  preferredTeacherContinuity: 0,
  teacherIdleGaps: 0,
  roomStability: 0,
  teacherLoadBalance: 0,
  subjectTimePreference: 0,
};

const OBJECTIVES: Array<{
  key: ManagementSolverObjectiveKey;
  title: string;
  summary: string;
  baseline: (workspace: ManagementSolverWorkspace) => string;
}> = [
  {
    key: 'changeCost',
    title: 'Mevcut programa sadakat',
    summary:
      'Yeni çözümün mevcut gün, saat, öğretmen ve salon kararlarını gereksiz yere değiştirmemesini tercih eder.',
    baseline: () => 'Mevcut program bu ölçekte başlangıç noktasıdır.',
  },
  {
    key: 'preferredTeacherContinuity',
    title: 'Esnek derslerde öğretmen devamlılığı',
    summary:
      'Öğretmeni blok bazında esnek olan fakat aynı öğretmenin sürmesi tercih edilen derslerde sürekliliği korumaya çalışır.',
    baseline: (workspace) =>
      `Mevcut program: ${workspace.preview.baselineMetrics.preferredTeacherContinuityBreaks} süreklilik kırılması`,
  },
  {
    key: 'teacherIdleGaps',
    title: 'Öğretmen boşluklarını azalt',
    summary:
      'Bir öğretmenin aynı gündeki dersleri arasında kalan boş ders saatlerini azaltmayı tercih eder.',
    baseline: (workspace) =>
      `Mevcut program: ${workspace.preview.baselineMetrics.teacherIdleGapPeriods} boş ders aralığı`,
  },
  {
    key: 'roomStability',
    title: 'Salon istikrarını koru',
    summary:
      'Aynı dersin bloklarının gereksiz biçimde farklı salonlara dağılmasını azaltmayı tercih eder.',
    baseline: (workspace) =>
      `Mevcut program: ${workspace.preview.baselineMetrics.roomStabilityBreaks} salon değişimi göstergesi`,
  },
];

function statusMeta(status: ManagementSolverProfileStatus) {
  if (status === 'ACTIVE') {
    return {
      label: 'Etkin',
      className: 'bg-emerald-100 text-emerald-700',
    };
  }

  if (status === 'ARCHIVED') {
    return {
      label: 'Arşivde',
      className: 'bg-slate-100 text-slate-500',
    };
  }

  return {
    label: 'Taslak',
    className: 'bg-amber-100 text-amber-700',
  };
}

function profileWeights(
  profile: ManagementSolverObjectiveProfile | null,
): ManagementSolverObjectiveWeights {
  return profile
    ? { ...EMPTY_WEIGHTS, ...profile.weights }
    : { ...EMPTY_WEIGHTS };
}

export function ManagementSolverWorkspacePanel({
  data,
  canEdit,
  busy,
  onSave,
}: {
  data: ManagementSolverWorkspace | null;
  canEdit: boolean;
  busy: boolean;
  onSave: (input: ManagementSolverProfileInput) => Promise<void>;
}) {
  const initialProfile = data?.profiles.find((profile) => profile.status === 'ACTIVE')
    ?? data?.profiles.find((profile) => profile.status === 'DRAFT')
    ?? null;

  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    initialProfile?.id ?? null,
  );
  const [name, setName] = useState(initialProfile?.name ?? '');
  const [description, setDescription] = useState(initialProfile?.description ?? '');
  const [weights, setWeights] = useState<ManagementSolverObjectiveWeights>(
    profileWeights(initialProfile),
  );
  const [localError, setLocalError] = useState<string | null>(null);

  const selectedProfile = useMemo(
    () => data?.profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [data?.profiles, selectedProfileId],
  );

  if (!data) {
    return (
      <section className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-500">
          Optimizasyon hazırlığı verisi alınamadı.
        </div>
      </section>
    );
  }

  const hardReady = data.preview.readiness.hardInputReady;
  const objectiveReady = data.preview.readiness.objectiveProfileReady;
  const provisionalInputs = data.preview.readiness.provisionalInputs ?? [];
  const unknownRooms = provisionalInputs.find(
    (item) => item.code === 'RESOURCE_MODE_UNKNOWN',
  ) ?? null;
  const positiveObjectiveCount = OBJECTIVES.filter(
    (objective) => weights[objective.key] > 0,
  ).length;
  const canActivate = (
    canEdit
    && !busy
    && name.trim().length > 0
    && positiveObjectiveCount > 0
  );

  const loadProfile = (profile: ManagementSolverObjectiveProfile | null) => {
    setSelectedProfileId(profile?.id ?? null);
    setName(profile?.name ?? '');
    setDescription(profile?.description ?? '');
    setWeights(profileWeights(profile));
    setLocalError(null);
  };

  const save = async (status: ManagementSolverProfileStatus) => {
    if (!canEdit || busy) return;

    if (name.trim().length === 0) {
      setLocalError('Profil adı gerekli.');
      return;
    }

    if (status === 'ACTIVE' && positiveObjectiveCount === 0) {
      setLocalError('Etkin profil için en az bir hedefe öncelik verin.');
      return;
    }

    setLocalError(null);

    try {
      await onSave({
        profileId: selectedProfileId,
        requirementSetId: data.requirementSetId,
        name: name.trim(),
        description: description.trim() || null,
        weights,
        status,
      });
    } catch (reason: unknown) {
      setLocalError(
        reason instanceof Error
          ? reason.message
          : 'Optimizasyon profili kaydedilemedi.',
      );
    }
  };

  return (
    <section className="management-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mx-auto grid max-w-[1460px] grid-cols-[280px_minmax(0,1fr)] gap-4">
        <aside className="self-start rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#A63D48]">
                Optimizasyon
              </p>
              <h2 className="mt-1 text-[15px] font-black text-slate-950">
                Hedef profilleri
              </h2>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => loadProfile(null)}
                disabled={busy}
                className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-[9px] font-black text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                + Yeni
              </button>
            )}
          </div>

          <p className="mt-2 text-[10px] font-medium leading-5 text-slate-500">
            Partisyon bir hedefi kendiliğinden “en iyi” kabul etmez. Solver ancak burada açıkça
            verdiğiniz öncelikleri kullanır.
          </p>

          <div className="mt-4 space-y-2">
            {data.profiles.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-[10px] font-semibold leading-5 text-slate-500">
                Henüz profil yok. Bir profil oluşturup hangi hedeflerin önemli olduğunu siz belirleyin.
              </div>
            ) : (
              data.profiles.map((profile) => {
                const selected = profile.id === selectedProfileId;
                const meta = statusMeta(profile.status);

                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => loadProfile(profile)}
                    className={`w-full rounded-2xl border p-3 text-left transition ${
                      selected
                        ? 'border-slate-950 bg-slate-950 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 truncate text-[10px] font-black">
                        {profile.name}
                      </p>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[8px] font-black ${meta.className}`}>
                        {meta.label}
                      </span>
                    </div>
                    <p className={`mt-1 text-[9px] font-semibold ${
                      selected ? 'text-slate-300' : 'text-slate-400'
                    }`}>
                      {Object.values(profile.weights).filter((value) => value > 0).length} etkin hedef
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                  Solver hazırlığı
                </p>
                <h1 className="mt-1 text-xl font-black tracking-tight text-slate-950">
                  Kurumun önceliklerini tanımlayın
                </h1>
                <p className="mt-2 max-w-3xl text-[10px] font-medium leading-5 text-slate-600">
                  Hard kurallar programın geçerli olup olmadığını belirler. Buradaki hedefler ise
                  birden fazla geçerli çözüm arasında neyin tercih edileceğini açıkça tanımlar.
                  Ağırlıklar yalnız birbirine göre önceliktir; tek başına kalite puanı değildir.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className={`rounded-full px-3 py-1.5 text-[9px] font-black ${
                  hardReady
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-rose-100 text-rose-700'
                }`}>
                  {hardReady ? 'Hard girdiler hazır' : 'Hard girdiler eksik'}
                </span>
                <span className={`rounded-full px-3 py-1.5 text-[9px] font-black ${
                  objectiveReady
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {objectiveReady ? 'Etkin hedef profili hazır' : 'Etkin hedef profili yok'}
                </span>
              </div>
            </div>

            {unknownRooms && (
              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/70 px-4 py-3">
                <p className="text-[10px] font-black text-blue-950">
                  {unknownRooms.count} dersin salon stratejisi provisional
                </p>
                <p className="mt-1 text-[9px] font-medium leading-4 text-blue-800">
                  Bu durum solver hazırlığını engellemiyor. {unknownRooms.withBaselineRoomEvidence ?? 0} derste
                  mevcut programdan salon kanıtı var; {unknownRooms.withoutBaselineRoomEvidence ?? 0} derste
                  salon kimliği henüz bilinmiyor. Partisyon bunları sabit salon kuralına dönüştürmüyor.
                </p>
              </div>
            )}
          </section>

          <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid grid-cols-[minmax(0,1fr)_220px] gap-4">
              <label className="block">
                <span className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                  Profil adı
                </span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={!canEdit || busy}
                  placeholder="Örn. Dönem programı — dengeli"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] font-bold text-slate-800 outline-none transition focus:border-slate-400 focus:bg-white disabled:opacity-50"
                />
              </label>

              <div>
                <span className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                  Durum
                </span>
                <div className="flex h-[38px] items-center rounded-xl border border-slate-200 bg-slate-50 px-3">
                  <span className="text-[10px] font-bold text-slate-600">
                    {selectedProfile
                      ? statusMeta(selectedProfile.status).label
                      : 'Yeni profil'}
                  </span>
                </div>
              </div>
            </div>

            <label className="mt-3 block">
              <span className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                Açıklama · isteğe bağlı
              </span>
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={!canEdit || busy}
                placeholder="Bu profil hangi program yaklaşımı için kullanılacak?"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[10px] font-medium text-slate-700 outline-none transition focus:border-slate-400 focus:bg-white disabled:opacity-50"
              />
            </label>
          </section>

          <div className="grid grid-cols-2 gap-3">
            {OBJECTIVES.map((objective) => {
              const current = weights[objective.key];

              return (
                <section
                  key={objective.key}
                  className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <h3 className="text-[12px] font-black text-slate-950">
                    {objective.title}
                  </h3>
                  <p className="mt-1 text-[9px] font-medium leading-4 text-slate-500">
                    {objective.summary}
                  </p>
                  <p className="mt-2 text-[9px] font-bold text-slate-400">
                    {objective.baseline(data)}
                  </p>

                  <div className="mt-4 grid grid-cols-5 gap-1">
                    {PRIORITY_LEVELS.map((level) => (
                      <button
                        key={level.value}
                        type="button"
                        disabled={!canEdit || busy}
                        onClick={() => setWeights((value) => ({
                          ...value,
                          [objective.key]: level.value,
                        }))}
                        className={`rounded-lg px-1 py-2 text-[8px] font-black transition ${
                          current === level.value
                            ? 'bg-slate-950 text-white'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        } disabled:opacity-50`}
                      >
                        {level.label}
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          <section className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50 p-4">
            <p className="text-[10px] font-black text-slate-700">
              Henüz etkinleştirilemeyen hedefler
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-white px-3 py-2.5">
                <p className="text-[9px] font-black text-slate-700">Öğretmen yük dengesi</p>
                <p className="mt-1 text-[8px] font-medium leading-4 text-slate-400">
                  Öğretmen bazlı minimum / hedef / maksimum ders yükleri tanımlandıktan sonra açılacak.
                </p>
              </div>
              <div className="rounded-xl bg-white px-3 py-2.5">
                <p className="text-[9px] font-black text-slate-700">Ders-saat tercihleri</p>
                <p className="mt-1 text-[8px] font-medium leading-4 text-slate-400">
                  Ders bazlı tercih edilen veya kaçınılan gün-saat kuralları tanımlandıktan sonra açılacak.
                </p>
              </div>
            </div>
          </section>

          {localError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[10px] font-bold text-rose-700">
              {localError}
            </div>
          )}

          <div className="flex items-center justify-between gap-4 rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
            <div>
              <p className="text-[10px] font-black text-slate-800">
                {positiveObjectiveCount} hedef açık
              </p>
              <p className="mt-1 text-[9px] font-medium text-slate-500">
                Etkin profil, ileride solver çalıştırılırken karşılaştırma ölçütlerini belirleyecek.
                Program bu ekranda değiştirilmez.
              </p>
            </div>

            {canEdit ? (
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => void save(selectedProfile?.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT')}
                  disabled={busy || name.trim().length === 0}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-[10px] font-black text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  {selectedProfile?.status === 'ACTIVE'
                    ? 'Değişiklikleri kaydet'
                    : 'Taslak kaydet'}
                </button>
                <button
                  type="button"
                  onClick={() => void save('ACTIVE')}
                  disabled={!canActivate}
                  className="rounded-xl bg-[#A63D48] px-4 py-2.5 text-[10px] font-black text-white hover:bg-[#8F3340] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Etkin profil yap
                </button>
              </div>
            ) : (
              <span className="text-[10px] font-semibold text-slate-400">
                Salt okunur
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
