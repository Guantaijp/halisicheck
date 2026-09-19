import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity.js';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async create(email: string, password: string, displayName?: string): Promise<User> {
    const normalised = email.trim().toLowerCase();

    if (await this.userRepo.exists({ where: { email: normalised } })) {
      throw new ConflictException('An account with that email already exists.');
    }

    const user = this.userRepo.create({
      email: normalised,
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      displayName: displayName?.trim() || null,
    });

    const saved = await this.userRepo.save(user);
    // The hash is `select: false`, but `save` returns what was written.
    delete (saved as Partial<User>).passwordHash;
    return saved;
  }

  /** Includes the password hash — only for the login path. */
  async findForLogin(email: string): Promise<User | null> {
    return this.userRepo.findOne({
      where: { email: email.trim().toLowerCase() },
      select: { id: true, email: true, passwordHash: true, isActive: true, displayName: true },
    });
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  async verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
