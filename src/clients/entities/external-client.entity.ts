import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('external_clients')
export class ExternalClientEntity {
    @PrimaryColumn({ length: 64 })
    clientId: string;

    /** bcrypt hash del secret — el plaintext se muestra solo al crear */
    @Column({ length: 128 })
    clientSecretHash: string;

    @Column({ length: 100 })
    name: string;

    @Column({ length: 255, nullable: true })
    description: string;

    @Column({ default: true })
    isActive: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
