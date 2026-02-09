import type { Application } from './Application';
import type { ApplicationService } from './ApplicationService';
import type { BaseArchitectureElement } from './BaseArchitectureElement';
import type { BusinessProcess } from './BusinessProcess';
import type { BusinessService } from './BusinessService';
import type { Capability } from './Capability';
import type { Department } from './Department';
import type { Enterprise } from './Enterprise';
import type { Programme } from './Programme';
import type { Project } from './Project';
import type { Technology } from './Technology';

export type RepositoryCollectionType =
  | 'enterprises'
  | 'capabilities'
  | 'businessServices'
  | 'businessProcesses'
  | 'departments'
  | 'applications'
  | 'applicationServices'
  | 'technologies'
  | 'programmes'
  | 'projects';

type RepositoryResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const expectedElementType: Record<
  RepositoryCollectionType,
  BaseArchitectureElement['elementType']
> = {
  enterprises: 'Enterprise',
  capabilities: 'Capability',
  businessServices: 'BusinessService',
  businessProcesses: 'BusinessProcess',
  departments: 'Department',
  applications: 'Application',
  applicationServices: 'ApplicationService',
  technologies: 'Technology',
  programmes: 'Programme',
  projects: 'Project',
};

const collectionTypeForElementType: Record<
  BaseArchitectureElement['elementType'],
  RepositoryCollectionType
> = {
  Enterprise: 'enterprises',
  Capability: 'capabilities',
  BusinessService: 'businessServices',
  BusinessProcess: 'businessProcesses',
  Department: 'departments',
  Application: 'applications',
  ApplicationService: 'applicationServices',
  Technology: 'technologies',
  Programme: 'programmes',
  Project: 'projects',
};

const isCapability = (e: BaseArchitectureElement): e is Capability =>
  e.elementType === 'Capability';
const isEnterprise = (e: BaseArchitectureElement): e is Enterprise =>
  e.elementType === 'Enterprise';
const isDepartment = (e: BaseArchitectureElement): e is Department =>
  e.elementType === 'Department';
const isBusinessProcess = (e: BaseArchitectureElement): e is BusinessProcess =>
  e.elementType === 'BusinessProcess';
const isBusinessService = (e: BaseArchitectureElement): e is BusinessService =>
  e.elementType === 'BusinessService';
const isApplication = (e: BaseArchitectureElement): e is Application =>
  e.elementType === 'Application';
const isApplicationService = (
  e: BaseArchitectureElement,
): e is ApplicationService => e.elementType === 'ApplicationService';
const isTechnology = (e: BaseArchitectureElement): e is Technology =>
  e.elementType === 'Technology';
const isProgramme = (e: BaseArchitectureElement): e is Programme =>
  e.elementType === 'Programme';
const isProject = (e: BaseArchitectureElement): e is Project =>
  e.elementType === 'Project';

/**
 * In-memory Enterprise Architecture repository core.
 *
 * Responsibilities:
 * - Store elements by collection.
 * - Enforce unique IDs across all collections.
 * - Enforce correct elementType per collection.
 *
 * Non-responsibilities:
 * - No relationships.
 * - No persistence.
 * - No APIs.
 */
export class ArchitectureRepository {
  private readonly byId = new Map<string, BaseArchitectureElement>();

  private readonly enterprises = new Map<string, Enterprise>();
  private readonly capabilities = new Map<string, Capability>();
  private readonly businessServices = new Map<string, BusinessService>();
  private readonly businessProcesses = new Map<string, BusinessProcess>();
  private readonly departments = new Map<string, Department>();
  private readonly applications = new Map<string, Application>();
  private readonly applicationServices = new Map<string, ApplicationService>();
  private readonly technologies = new Map<string, Technology>();
  private readonly programmes = new Map<string, Programme>();
  private readonly projects = new Map<string, Project>();

  addElement(type: 'enterprises', element: Enterprise): RepositoryResult<void>;
  addElement(type: 'capabilities', element: Capability): RepositoryResult<void>;
  addElement(
    type: 'businessServices',
    element: BusinessService,
  ): RepositoryResult<void>;
  addElement(
    type: 'businessProcesses',
    element: BusinessProcess,
  ): RepositoryResult<void>;
  addElement(type: 'departments', element: Department): RepositoryResult<void>;
  addElement(
    type: 'applications',
    element: Application,
  ): RepositoryResult<void>;
  addElement(
    type: 'applicationServices',
    element: ApplicationService,
  ): RepositoryResult<void>;
  addElement(type: 'technologies', element: Technology): RepositoryResult<void>;
  addElement(type: 'programmes', element: Programme): RepositoryResult<void>;
  addElement(type: 'projects', element: Project): RepositoryResult<void>;
  addElement(
    type: RepositoryCollectionType,
    element: BaseArchitectureElement,
  ): RepositoryResult<void>;
  addElement(
    type: RepositoryCollectionType,
    element: BaseArchitectureElement,
  ): RepositoryResult<void> {
    if (this.byId.has(element.id)) {
      return { ok: false, error: `Duplicate id: ${element.id}` };
    }

    const expected = expectedElementType[type];
    if (element.elementType !== expected) {
      return {
        ok: false,
        error: `Rejected insert: elementType '${element.elementType}' does not match collection '${type}' (expected '${expected}').`,
      };
    }

    // Insert into the correct collection only.
    switch (type) {
      case 'enterprises':
        if (!isEnterprise(element)) {
          return {
            ok: false,
            error: 'Rejected insert: element is not an Enterprise.',
          };
        }
        this.enterprises.set(element.id, element);
        break;
      case 'capabilities':
        if (!isCapability(element)) {
          return {
            ok: false,
            error: 'Rejected insert: element is not a Capability.',
          };
        }
        this.capabilities.set(element.id, element);
        break;
      case 'businessServices':
        if (!isBusinessService(element)) {
          return {
            ok: false,
            error: 'Rejected insert: element is not a BusinessService.',
          };
        }
        this.businessServices.set(element.id, element);
        break;
      case 'businessProcesses':
        if (!isBusinessProcess(element)) {
          return {
            ok: false,
            error: 'Rejected insert: element is not a BusinessProcess.',
          };
        }
        this.businessProcesses.set(element.id, element);
        break;
      case 'departments':
        if (!isDepartment(element)) {
          return {
            ok: false,
            error: 'Rejected insert: element is not a Department.',
          };
        }
        this.departments.set(element.id, element);
        break;
      case 'applications':
        if (!isApplication(element)) {
          return {
            ok: false,
            error: 'Rejected insert: element is not an Application.',
          };
        }
        this.applications.set(element.id, element);
        break;
      case 'applicationServices':
        if (!isApplicationService(element)) {
          return {
            ok: false,
            error: 'Rejected insert: element is not an ApplicationService.',
          };
        }
        this.applicationServices.set(element.id, element);
        break;
      case 'technologies':
        if (!isTechnology(element)) {
          return {
            ok: false,
            error: 'Rejected insert: element is not a Technology.',
          };
        }
        this.technologies.set(element.id, element);
        break;
      case 'programmes':
        if (!isProgramme(element)) {
          return {
            ok: false,
            error: 'Rejected insert: element is not a Programme.',
          };
        }
        this.programmes.set(element.id, element);
        break;
      case 'projects':
        if (!isProject(element)) {
          return {
            ok: false,
            error: 'Rejected insert: element is not a Project.',
          };
        }
        this.projects.set(element.id, element);
        break;
      default: {
        const _exhaustive: never = type;
        return {
          ok: false,
          error: `Unsupported collection type: ${String(_exhaustive)}`,
        };
      }
    }

    this.byId.set(element.id, element);
    return { ok: true, value: undefined };
  }

  getElementsByType(type: 'enterprises'): Enterprise[];
  getElementsByType(type: 'capabilities'): Capability[];
  getElementsByType(type: 'businessServices'): BusinessService[];
  getElementsByType(type: 'businessProcesses'): BusinessProcess[];
  getElementsByType(type: 'departments'): Department[];
  getElementsByType(type: 'applications'): Application[];
  getElementsByType(type: 'applicationServices'): ApplicationService[];
  getElementsByType(type: 'technologies'): Technology[];
  getElementsByType(type: 'programmes'): Programme[];
  getElementsByType(type: 'projects'): Project[];
  getElementsByType(type: RepositoryCollectionType): BaseArchitectureElement[];
  getElementsByType(type: RepositoryCollectionType): BaseArchitectureElement[] {
    switch (type) {
      case 'enterprises':
        return Array.from(this.enterprises.values());
      case 'capabilities':
        return Array.from(this.capabilities.values());
      case 'businessServices':
        return Array.from(this.businessServices.values());
      case 'businessProcesses':
        return Array.from(this.businessProcesses.values());
      case 'departments':
        return Array.from(this.departments.values());
      case 'applications':
        return Array.from(this.applications.values());
      case 'applicationServices':
        return Array.from(this.applicationServices.values());
      case 'technologies':
        return Array.from(this.technologies.values());
      case 'programmes':
        return Array.from(this.programmes.values());
      case 'projects':
        return Array.from(this.projects.values());
      default: {
        const _exhaustive: never = type;
        return [];
      }
    }
  }

  getElementById(id: string): BaseArchitectureElement | null {
    return this.byId.get(id) ?? null;
  }

  updateElementLifecycle(args: {
    id: string;
    lifecycleStatus: BaseArchitectureElement['lifecycleStatus'];
    lastModifiedAt?: string;
    lastModifiedBy?: string;
  }): RepositoryResult<BaseArchitectureElement> {
    const id = (args.id ?? '').trim();
    if (!id) return { ok: false, error: 'Rejected update: id is required.' };

    const existing = this.byId.get(id);
    if (!existing)
      return { ok: false, error: `Rejected update: unknown id "${id}".` };

    const updated: BaseArchitectureElement = {
      ...existing,
      lifecycleStatus: args.lifecycleStatus,
      lastModifiedAt: args.lastModifiedAt ?? new Date().toISOString(),
      lastModifiedBy: args.lastModifiedBy ?? existing.lastModifiedBy,
    };

    const collectionType = collectionTypeForElementType[updated.elementType];
    switch (collectionType) {
      case 'enterprises':
        this.enterprises.set(id, updated as Enterprise);
        break;
      case 'capabilities':
        this.capabilities.set(id, updated as Capability);
        break;
      case 'businessServices':
        this.businessServices.set(id, updated as BusinessService);
        break;
      case 'businessProcesses':
        this.businessProcesses.set(id, updated as BusinessProcess);
        break;
      case 'departments':
        this.departments.set(id, updated as Department);
        break;
      case 'applications':
        this.applications.set(id, updated as Application);
        break;
      case 'applicationServices':
        this.applicationServices.set(id, updated as ApplicationService);
        break;
      case 'technologies':
        this.technologies.set(id, updated as Technology);
        break;
      case 'programmes':
        this.programmes.set(id, updated as Programme);
        break;
      case 'projects':
        this.projects.set(id, updated as Project);
        break;
      default: {
        const _exhaustive: never = collectionType;
        return {
          ok: false,
          error: `Rejected update: unsupported element type "${String(_exhaustive)}".`,
        };
      }
    }

    this.byId.set(id, updated);
    return { ok: true, value: updated };
  }

  removeElementById(id: string): RepositoryResult<BaseArchitectureElement> {
    const key = (id ?? '').trim();
    if (!key) return { ok: false, error: 'Rejected remove: id is required.' };

    const existing = this.byId.get(key);
    if (!existing)
      return { ok: false, error: `Rejected remove: unknown id "${key}".` };

    const collectionType = collectionTypeForElementType[existing.elementType];
    switch (collectionType) {
      case 'enterprises':
        this.enterprises.delete(key);
        break;
      case 'capabilities':
        this.capabilities.delete(key);
        break;
      case 'businessServices':
        this.businessServices.delete(key);
        break;
      case 'businessProcesses':
        this.businessProcesses.delete(key);
        break;
      case 'departments':
        this.departments.delete(key);
        break;
      case 'applications':
        this.applications.delete(key);
        break;
      case 'applicationServices':
        this.applicationServices.delete(key);
        break;
      case 'technologies':
        this.technologies.delete(key);
        break;
      case 'programmes':
        this.programmes.delete(key);
        break;
      case 'projects':
        this.projects.delete(key);
        break;
      default: {
        const _exhaustive: never = collectionType;
        return {
          ok: false,
          error: `Rejected remove: unsupported element type "${String(_exhaustive)}".`,
        };
      }
    }

    this.byId.delete(key);
    return { ok: true, value: existing };
  }
}

export function createArchitectureRepository(): ArchitectureRepository {
  return new ArchitectureRepository();
}
