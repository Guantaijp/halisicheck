import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { Job } from '../../jobs/entities/job.entity.js';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 320 })
  email: string;

  /** bcrypt hash. Never selected by default — see UsersService.findForLogin. */
  @Column({ type: 'varchar', length: 120, select: false })
  passwordHash: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  displayName: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => Job, (job) => job.user)
  jobs: Relation<Job[]>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
