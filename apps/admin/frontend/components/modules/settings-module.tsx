'use client';

import { useState, type FormEvent } from 'react';
import {
  humanizeStatus,
  type AdminMutation,
  type DashboardState,
  type ParishProfile,
  type RequirementSetting,
  type ServiceSetting,
} from '@/shared/domain';
import { StatusPill } from '@/frontend/components/modules/portal-shared';

type SettingsSection = 'parish' | 'sacraments' | 'venues' | 'access';

type Props = {
  data: DashboardState;
  busy: boolean;
  runMutation: (mutation: AdminMutation, successMessage: string) => Promise<boolean>;
  onIssueTemporaryPassword: (userId: string, name: string) => Promise<void>;
};

function ParishProfileForm({
  profile,
  canEdit,
  busy,
  runMutation,
}: {
  profile: ParishProfile;
  canEdit: boolean;
  busy: boolean;
  runMutation: (mutation: AdminMutation, successMessage: string) => Promise<boolean>;
}) {
  const [address, setAddress] = useState(profile.address ?? '');
  const [officeHours, setOfficeHours] = useState(profile.officeHours ?? '');
  const [contactPhone, setContactPhone] = useState(profile.contactPhone ?? '');
  const [contactEmail, setContactEmail] = useState(profile.contactEmail ?? '');
  const [description, setDescription] = useState(profile.description ?? '');

  if (!canEdit) {
    return (
      <div className="stack-form">
        <div className="alert info">
          <strong>Read-only access</strong>
          <span>Public parish directory details are maintained by parish staff and system administrators.</span>
        </div>
        <dl className="detail-list">
          <div>
            <dt>Parish</dt>
            <dd>{profile.name}</dd>
          </div>
          <div>
            <dt>Address</dt>
            <dd>{profile.address ?? 'Not published'}</dd>
          </div>
          <div>
            <dt>Office hours</dt>
            <dd>{profile.officeHours ?? 'Not published'}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{profile.contactPhone ?? 'Not published'}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{profile.contactEmail ?? 'Not published'}</dd>
          </div>
          <div>
            <dt>Pastoral note</dt>
            <dd>{profile.description ?? 'Not published'}</dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <form
      className="stack-form"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void runMutation(
          {
            action: 'parish.profile.update',
            parishId: profile.id,
            address: address.trim() || null,
            officeHours: officeHours.trim() || null,
            contactPhone: contactPhone.trim() || null,
            contactEmail: contactEmail.trim() || null,
            description: description.trim() || null,
          },
          `${profile.name} directory updated.`,
        );
      }}
    >
      <label>
        <span>Street / barangay address</span>
        <input
          value={address}
          maxLength={240}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="e.g. Sto. Rosario, City of San Fernando, Pampanga"
        />
      </label>
      <label>
        <span>Office hours</span>
        <input
          value={officeHours}
          maxLength={160}
          onChange={(event) => setOfficeHours(event.target.value)}
          placeholder="e.g. Tue–Sat 8:00 AM – 12:00 NN, 1:30 PM – 5:00 PM"
        />
      </label>
      <div className="filter-bar">
        <label>
          <span>Contact phone</span>
          <input
            value={contactPhone}
            maxLength={24}
            onChange={(event) => setContactPhone(event.target.value)}
            placeholder="+63 (045) 555-0101"
          />
        </label>
        <label>
          <span>Contact email</span>
          <input
            type="email"
            value={contactEmail}
            maxLength={254}
            onChange={(event) => setContactEmail(event.target.value)}
            placeholder="office@parish.example"
          />
        </label>
      </div>
      <label>
        <span>Pastoral directory note</span>
        <textarea
          value={description}
          maxLength={500}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Short public description shown in the parishioner mobile directory"
        />
      </label>
      <button className="primary-button" disabled={busy}>
        Save parish profile
      </button>
      <small>
        Updates are stored as plain text and reflected immediately in the mobile parish directory and inquiry
        assistant.
      </small>
    </form>
  );
}

function ServiceRuleForm({
  service,
  canEdit,
  busy,
  runMutation,
}: {
  service: ServiceSetting;
  canEdit: boolean;
  busy: boolean;
  runMutation: (mutation: AdminMutation, successMessage: string) => Promise<boolean>;
}) {
  const [durationMinutes, setDurationMinutes] = useState(String(service.durationMinutes));
  const [bufferBeforeMinutes, setBufferBeforeMinutes] = useState(String(service.bufferBeforeMinutes));
  const [bufferAfterMinutes, setBufferAfterMinutes] = useState(String(service.bufferAfterMinutes));
  const [description, setDescription] = useState(service.description ?? '');
  const [isActive, setIsActive] = useState(service.isActive);

  if (!canEdit) {
    return (
      <div className="stack-form">
        <div className="alert info">
          <strong>Read-only policy view</strong>
          <span>Sacrament scheduling intervals and requirement definitions are managed by system administrators.</span>
        </div>
        <dl className="detail-list">
          <div>
            <dt>Availability</dt>
            <dd>
              <StatusPill value={service.isActive ? 'active' : 'paused'} />
            </dd>
          </div>
          <div>
            <dt>Standard duration</dt>
            <dd>{service.durationMinutes} minutes</dd>
          </div>
          <div>
            <dt>Preparation buffer</dt>
            <dd>{service.bufferBeforeMinutes} min before</dd>
          </div>
          <div>
            <dt>Cleanup buffer</dt>
            <dd>{service.bufferAfterMinutes} min after</dd>
          </div>
          <div>
            <dt>Catalog description</dt>
            <dd>{service.description ?? 'Default description'}</dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <form
      className="stack-form"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void runMutation(
          {
            action: 'service.update',
            serviceTypeId: service.id,
            durationMinutes: Number(durationMinutes),
            bufferBeforeMinutes: Number(bufferBeforeMinutes),
            bufferAfterMinutes: Number(bufferAfterMinutes),
            description: description.trim() || null,
            isActive,
          },
          `${service.name} scheduling rules updated.`,
        );
      }}
    >
      <div className="filter-bar">
        <label>
          <span>Duration (minutes)</span>
          <input
            type="number"
            min={15}
            max={360}
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(event.target.value)}
          />
        </label>
        <label>
          <span>Availability</span>
          <select
            value={isActive ? 'active' : 'paused'}
            onChange={(event) => setIsActive(event.target.value === 'active')}
          >
            <option value="active">Active in mobile booking</option>
            <option value="paused">Paused for new bookings</option>
          </select>
        </label>
      </div>
      <div className="filter-bar">
        <label>
          <span>Buffer before (minutes)</span>
          <input
            type="number"
            min={0}
            max={120}
            value={bufferBeforeMinutes}
            onChange={(event) => setBufferBeforeMinutes(event.target.value)}
          />
        </label>
        <label>
          <span>Buffer after (minutes)</span>
          <input
            type="number"
            min={0}
            max={120}
            value={bufferAfterMinutes}
            onChange={(event) => setBufferAfterMinutes(event.target.value)}
          />
        </label>
      </div>
      <label>
        <span>Public sacrament summary</span>
        <textarea
          value={description}
          maxLength={500}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Short guidance shown when parishioners select this sacrament"
        />
      </label>
      <button className="primary-button" disabled={busy}>
        Save sacrament rules
      </button>
      <small>
        Existing appointments retain the booking-time preparation buffers captured when they were scheduled.
      </small>
    </form>
  );
}

function RequirementRowCard({
  requirement,
  canEdit,
  busy,
  runMutation,
}: {
  requirement: RequirementSetting;
  canEdit: boolean;
  busy: boolean;
  runMutation: (mutation: AdminMutation, successMessage: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(requirement.name);
  const [instructions, setInstructions] = useState(requirement.instructions ?? '');
  const [isRequired, setIsRequired] = useState(requirement.isRequired);
  const [sortOrder, setSortOrder] = useState(String(requirement.sortOrder));
  const [isActive, setIsActive] = useState(requirement.isActive);

  return (
    <article className="document-card">
      <div className="document-top">
        <div>
          <span className="eyebrow">
            Order #{requirement.sortOrder} · {requirement.isRequired ? 'Mandatory' : 'Optional'}
          </span>
          <h3>{requirement.name}</h3>
          <p>{requirement.instructions ?? 'No supplementary instructions specified.'}</p>
        </div>
        <StatusPill value={requirement.isActive ? 'active' : 'inactive'} />
      </div>
      {canEdit && !editing && (
        <div className="document-actions">
          <button
            type="button"
            className="row-action"
            disabled={busy}
            onClick={() => {
              setName(requirement.name);
              setInstructions(requirement.instructions ?? '');
              setIsRequired(requirement.isRequired);
              setSortOrder(String(requirement.sortOrder));
              setIsActive(requirement.isActive);
              setEditing(true);
            }}
          >
            Edit requirement
          </button>
        </div>
      )}
      {canEdit && editing && (
        <form
          className="stack-form requirement-edit-form"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void runMutation(
              {
                action: 'requirement.update',
                requirementId: requirement.id,
                name,
                instructions: instructions.trim() || null,
                isRequired,
                sortOrder: Number(sortOrder),
                isActive,
              },
              `Updated ${name}.`,
            ).then((saved) => {
              if (saved) setEditing(false);
            });
          }}
        >
          <label>
            <span>Requirement name</span>
            <input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            <span>Submission instructions</span>
            <input
              value={instructions}
              maxLength={500}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Optional guidance for parishioners and reviewers"
            />
          </label>
          <div className="filter-bar">
            <label>
              <span>Policy</span>
              <select
                value={isRequired ? 'required' : 'optional'}
                onChange={(event) => setIsRequired(event.target.value === 'required')}
              >
                <option value="required">Mandatory before approval</option>
                <option value="optional">Optional supporting file</option>
              </select>
            </label>
            <label>
              <span>Status</span>
              <select
                value={isActive ? 'active' : 'inactive'}
                onChange={(event) => setIsActive(event.target.value === 'active')}
              >
                <option value="active">Active for new bookings</option>
                <option value="inactive">Retired / hidden</option>
              </select>
            </label>
          </div>
          <label>
            <span>Display order</span>
            <input
              type="number"
              min={0}
              max={999}
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
            />
          </label>
          <div className="document-actions">
            <button type="submit" className="approve-button" disabled={busy || name.trim().length < 3}>
              Save requirement
            </button>
            <button
              type="button"
              className="secondary-button compact"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </article>
  );
}

export function SettingsModule({ data, busy, runMutation, onIssueTemporaryPassword }: Props) {
  const [section, setSection] = useState<SettingsSection>('parish');
  const [selectedParishId, setSelectedParishId] = useState(
    () => data.actor.parishId || data.parishProfiles[0]?.id || data.parishes[0]?.id || '',
  );
  const [selectedServiceId, setSelectedServiceId] = useState(
    () => data.serviceSettings[0]?.id ?? 'baptism',
  );

  const [newReqName, setNewReqName] = useState('');
  const [newReqInstructions, setNewReqInstructions] = useState('');
  const [newReqRequired, setNewReqRequired] = useState(true);

  const [newVenueParishId, setNewVenueParishId] = useState(
    () => data.actor.parishId || data.parishes[0]?.id || '',
  );
  const [newVenueName, setNewVenueName] = useState('');
  const [newVenueCapacity, setNewVenueCapacity] = useState('');

  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<'parish_staff' | 'clergy'>('parish_staff');
  const [newUserParishId, setNewUserParishId] = useState(() => data.parishes[0]?.id || '');

  const selectedProfile =
    data.parishProfiles.find((item) => item.id === selectedParishId) ?? data.parishProfiles[0] ?? null;
  const selectedService =
    data.serviceSettings.find((item) => item.id === selectedServiceId) ?? data.serviceSettings[0] ?? null;

  const canEditParish =
    data.actor.role === 'system_admin' ||
    (data.actor.role === 'parish_staff' && selectedProfile?.id === data.actor.parishId);
  const isSystemAdmin = data.actor.role === 'system_admin';

  return (
    <div className="settings-workspace">
      <div className="subnav-tabs" role="tablist" aria-label="Settings sections">
        <button
          type="button"
          role="tab"
          aria-selected={section === 'parish'}
          className={section === 'parish' ? 'subnav-tab active' : 'subnav-tab'}
          onClick={() => setSection('parish')}
        >
          Parish profile
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'sacraments'}
          className={section === 'sacraments' ? 'subnav-tab active' : 'subnav-tab'}
          onClick={() => setSection('sacraments')}
        >
          Sacraments & requirements
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'venues'}
          className={section === 'venues' ? 'subnav-tab active' : 'subnav-tab'}
          onClick={() => setSection('venues')}
        >
          Parish venues
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'access'}
          className={section === 'access' ? 'subnav-tab active' : 'subnav-tab'}
          onClick={() => setSection('access')}
        >
          Internal access
        </button>
      </div>

      {section === 'parish' && (
        <section className="module-layout">
          <article className="panel module-primary">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Public parish directory</span>
                <h2>{selectedProfile?.name ?? 'Parish profile'}</h2>
              </div>
              {data.parishProfiles.length > 1 && (
                <label className="inline-selector">
                  <span className="sr-only">Select parish</span>
                  <select
                    value={selectedProfile?.id ?? ''}
                    onChange={(event) => setSelectedParishId(event.target.value)}
                  >
                    {data.parishProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {selectedProfile ? (
              <ParishProfileForm
                key={selectedProfile.id}
                profile={selectedProfile}
                canEdit={canEditParish}
                busy={busy}
                runMutation={runMutation}
              />
            ) : (
              <div className="empty-state">
                <strong>No parish profile available</strong>
                <span>Assign a parish to manage its directory profile.</span>
              </div>
            )}
          </article>
          <aside className="panel detail-panel">
            <span className="eyebrow">Directory visibility</span>
            <h2>Where this appears</h2>
            <p className="body-copy">
              Published office hours, address, telephone number, and email appear in the ParishLink mobile
              directory and are cited by the grounded parish inquiry assistant when answering general questions.
            </p>
            <div className="note-box">
              <strong>Privacy safeguard</strong>
              <p>
                Publish official parish office contact channels only—never personal mobile numbers or private
                staff addresses.
              </p>
            </div>
          </aside>
        </section>
      )}

      {section === 'sacraments' && (
        <section className="module-layout">
          <article className="panel module-primary">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Canonical checklist & timing</span>
                <h2>{selectedService?.name ?? 'Sacraments'}</h2>
              </div>
              <label className="inline-selector">
                <span className="sr-only">Select sacrament</span>
                <select
                  value={selectedService?.id ?? ''}
                  onChange={(event) => setSelectedServiceId(event.target.value)}
                >
                  {data.serviceSettings.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {selectedService && (
              <>
                <ServiceRuleForm
                  key={selectedService.id}
                  service={selectedService}
                  canEdit={isSystemAdmin}
                  busy={busy}
                  runMutation={runMutation}
                />
                <hr className="settings-divider" />
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">Documentary checklist</span>
                    <h2>{`Requirements for ${selectedService.name}`}</h2>
                  </div>
                  <span className="result-count">{selectedService.requirements.length} items</span>
                </div>
                <div className="document-grid">
                  {selectedService.requirements.map((requirement) => (
                    <RequirementRowCard
                      key={requirement.id}
                      requirement={requirement}
                      canEdit={isSystemAdmin}
                      busy={busy}
                      runMutation={runMutation}
                    />
                  ))}
                </div>
              </>
            )}
          </article>
          <aside className="panel detail-panel">
            <span className="eyebrow">New checklist item</span>
            <h2>Add documentary requirement</h2>
            {!isSystemAdmin ? (
              <div className="alert info">
                <strong>Read-only access</strong>
                <span>
                  Adding or retiring vicariate-wide documentary requirements is restricted to system
                  administrators.
                </span>
              </div>
            ) : selectedService ? (
              <form
                className="stack-form"
                onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  void runMutation(
                    {
                      action: 'requirement.create',
                      serviceTypeId: selectedService.id,
                      name: newReqName,
                      instructions: newReqInstructions.trim() || null,
                      isRequired: newReqRequired,
                    },
                    `Added requirement to ${selectedService.name}.`,
                  ).then((saved) => {
                    if (saved) {
                      setNewReqName('');
                      setNewReqInstructions('');
                    }
                  });
                }}
              >
                <label>
                  <span>Sacrament</span>
                  <input value={selectedService.name} readOnly aria-readonly="true" />
                </label>
                <label>
                  <span>Requirement name</span>
                  <input
                    value={newReqName}
                    maxLength={120}
                    onChange={(event) => setNewReqName(event.target.value)}
                    placeholder="e.g. Confirmation sponsor endorsement"
                  />
                </label>
                <label>
                  <span>Instructions (optional)</span>
                  <textarea
                    value={newReqInstructions}
                    maxLength={500}
                    onChange={(event) => setNewReqInstructions(event.target.value)}
                    placeholder="Explain what parish staff check on this document"
                  />
                </label>
                <label>
                  <span>Policy</span>
                  <select
                    value={newReqRequired ? 'required' : 'optional'}
                    onChange={(event) => setNewReqRequired(event.target.value === 'required')}
                  >
                    <option value="required">Mandatory before approval</option>
                    <option value="optional">Optional supporting document</option>
                  </select>
                </label>
                <button className="primary-button" disabled={busy || newReqName.trim().length < 3}>
                  Add requirement
                </button>
                <small>
                  New requirements apply to upcoming bookings. Appointments already submitted keep their original
                  checklist snapshot.
                </small>
              </form>
            ) : null}
          </aside>
        </section>
      )}

      {section === 'venues' && (
        <section className="module-layout">
          <article className="panel module-primary">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Scheduling resources</span>
                <h2>Active parish venues</h2>
              </div>
              <span className="result-count">{data.venueOptions.length} venues</span>
            </div>
            {data.venueOptions.length ? (
              <div className="table-wrap" tabIndex={0} aria-label="Active parish venues">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Venue</th>
                      <th scope="col">Parish</th>
                      <th scope="col">Capacity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.venueOptions.map((venue) => {
                      const parishName =
                        data.parishes.find((parish) => parish.id === venue.parishId)?.name ?? venue.parishId;
                      return (
                        <tr key={venue.id}>
                          <td>
                            <strong>{venue.name}</strong>
                          </td>
                          <td>{parishName}</td>
                          <td>{venue.capacity ? `${venue.capacity} seats` : 'Unspecified'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                <strong>No venues configured</strong>
                <span>Add a church, chapel, or baptistry to enable conflict-checked scheduling.</span>
              </div>
            )}
          </article>
          <aside className="panel detail-panel">
            <span className="eyebrow">New resource</span>
            <h2>Add a parish venue</h2>
            {data.actor.role === 'clergy' ? (
              <div className="alert info">
                <strong>Read-only access</strong>
                <span>Venue setup is assigned to parish staff and system administrators.</span>
              </div>
            ) : (
              <form
                className="stack-form"
                onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  void runMutation(
                    {
                      action: 'venue.create',
                      parishId: newVenueParishId,
                      name: newVenueName,
                      ...(newVenueCapacity ? { capacity: Number(newVenueCapacity) } : {}),
                    },
                    'Parish venue created.',
                  ).then((saved) => {
                    if (saved) {
                      setNewVenueName('');
                      setNewVenueCapacity('');
                    }
                  });
                }}
              >
                <label>
                  <span>Parish</span>
                  <select
                    value={newVenueParishId}
                    onChange={(event) => setNewVenueParishId(event.target.value)}
                  >
                    {data.parishes.map((parish) => (
                      <option value={parish.id} key={parish.id}>
                        {parish.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Venue name</span>
                  <input
                    value={newVenueName}
                    maxLength={100}
                    onChange={(event) => setNewVenueName(event.target.value)}
                    placeholder="e.g. Adoration chapel"
                  />
                </label>
                <label>
                  <span>Capacity (optional)</span>
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    value={newVenueCapacity}
                    onChange={(event) => setNewVenueCapacity(event.target.value)}
                  />
                </label>
                <button className="primary-button" disabled={busy || newVenueName.trim().length < 3}>
                  Add venue
                </button>
              </form>
            )}
          </aside>
        </section>
      )}

      {section === 'access' && (
        <section className="configuration-grid" style={{ marginTop: 0 }}>
          {!isSystemAdmin ? (
            <article className="panel configuration-wide">
              <span className="eyebrow">Role-based access control</span>
              <h2>System administrator access required</h2>
              <div className="empty-state aligned" style={{ marginTop: 14 }}>
                <strong>Restricted to technical administration</strong>
                <span>
                  Provisioning parish staff or clergy accounts, revoking sessions, and issuing one-time temporary
                  passwords require system administrator privileges.
                </span>
              </div>
            </article>
          ) : (
            <>
              <article className="panel">
                <span className="eyebrow">Role-based access</span>
                <h2>Provision internal access</h2>
                <form
                  className="stack-form"
                  onSubmit={(event: FormEvent) => {
                    event.preventDefault();
                    void runMutation(
                      {
                        action: 'user.provision',
                        fullName: newUserName,
                        email: newUserEmail,
                        role: newUserRole,
                        parishId: newUserParishId,
                      },
                      'Internal access provisioned.',
                    ).then((saved) => {
                      if (saved) {
                        setNewUserName('');
                        setNewUserEmail('');
                      }
                    });
                  }}
                >
                  <label>
                    <span>Complete name</span>
                    <input
                      value={newUserName}
                      maxLength={120}
                      onChange={(event) => setNewUserName(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Email address</span>
                    <input
                      type="email"
                      value={newUserEmail}
                      maxLength={254}
                      onChange={(event) => setNewUserEmail(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Role</span>
                    <select
                      value={newUserRole}
                      onChange={(event) => setNewUserRole(event.target.value as 'parish_staff' | 'clergy')}
                    >
                      <option value="parish_staff">Parish staff</option>
                      <option value="clergy">Clergy / priest</option>
                    </select>
                  </label>
                  <label>
                    <span>Parish</span>
                    <select
                      value={newUserParishId}
                      onChange={(event) => setNewUserParishId(event.target.value)}
                    >
                      {data.parishes.map((parish) => (
                        <option value={parish.id} key={parish.id}>
                          {parish.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="primary-button"
                    disabled={busy || newUserName.trim().length < 3 || !newUserEmail.includes('@')}
                  >
                    Provision access
                  </button>
                  <small>
                    After provisioning, use “Temporary password” in the access register and share it privately. The
                    person must choose a new password at first sign-in.
                  </small>
                </form>
              </article>

              <article className="panel">
                <span className="eyebrow">Least-privilege separation</span>
                <h2>Account governance</h2>
                <p className="body-copy">
                  Deactivating an internal account immediately revokes every open staff session and removes inactive
                  clergy from public booking availability.
                </p>
                <div className="note-box">
                  <strong>Separation of duties</strong>
                  <p>
                    System administrators manage accounts and vicariate settings, while parishioner documentary
                    files and archive entries remain restricted to assigned parish staff.
                  </p>
                </div>
              </article>

              <article className="panel configuration-wide">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">Authorized personnel</span>
                    <h2>Internal access register</h2>
                  </div>
                  <span className="result-count">{data.accessUsers.length} accounts</span>
                </div>
                <div className="access-list">
                  {data.accessUsers.map((user) => (
                    <div key={user.id}>
                      <div>
                        <strong>{user.name}</strong>
                        <span>
                          {user.email} · {humanizeStatus(user.role)} · {user.parish}
                        </span>
                      </div>
                      <div className="access-actions">
                        <button
                          className="secondary-button"
                          disabled={busy || user.id === data.actor.id || !user.isActive}
                          onClick={() => void onIssueTemporaryPassword(user.id, user.name)}
                        >
                          Temporary password
                        </button>
                        <button
                          className={user.isActive ? 'danger-button' : 'approve-button'}
                          disabled={busy || user.id === data.actor.id}
                          onClick={() =>
                            void runMutation(
                              { action: 'user.set_active', userId: user.id, isActive: !user.isActive },
                              `${user.name} access ${user.isActive ? 'deactivated' : 'activated'}.`,
                            )
                          }
                        >
                          {user.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </>
          )}
        </section>
      )}
    </div>
  );
}
