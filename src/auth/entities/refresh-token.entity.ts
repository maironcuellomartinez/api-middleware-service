import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    Index,
} from 'typeorm';

@Entity('refresh_tokens')
export class RefreshTokenEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ length: 64 })
    clientId: string;

    /** bcrypt hash del refresh token JWT */
    @Column({ length: 128 })
    tokenHash: string;

    @Column()
    expiresAt: Date;

    @Column({ nullable: true })
    revokedAt: Date | null;

    @CreateDateColumn()
    createdAt: Date;
}
