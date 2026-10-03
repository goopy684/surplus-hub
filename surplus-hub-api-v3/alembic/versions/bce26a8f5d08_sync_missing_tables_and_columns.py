"""sync missing admin/moderation/stats tables and users.admin_role

These model tables were defined in app/models but never created by any
migration, so a fresh production DB was missing them and the admin/
moderation/stats code paths (and the admin RBAC reading users.admin_role)
would crash at runtime. This migration adds ONLY the genuinely-missing
objects. The noisy autogenerate output (dropping the transactions table and
the pgvector HNSW index, reshuffling categories constraints, and adding
redundant indexes on PK id columns) was intentionally discarded.

Revision ID: bce26a8f5d08
Revises: phase1_001
Create Date: 2026-06-14
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'bce26a8f5d08'
down_revision = 'phase1_001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'daily_stats',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('new_users', sa.Integer(), nullable=True),
        sa.Column('active_users', sa.Integer(), nullable=True),
        sa.Column('new_materials', sa.Integer(), nullable=True),
        sa.Column('new_transactions', sa.Integer(), nullable=True),
        sa.Column('completed_transactions', sa.Integer(), nullable=True),
        sa.Column('total_transaction_amount', sa.Float(), nullable=True),
        sa.Column('new_reports', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_daily_stats_date'), 'daily_stats', ['date'], unique=True)
    op.create_index(op.f('ix_daily_stats_id'), 'daily_stats', ['id'], unique=False)

    op.create_table(
        'admin_audit_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('admin_id', sa.Integer(), nullable=False),
        sa.Column('action', sa.String(), nullable=False),
        sa.Column('target_type', sa.String(), nullable=True),
        sa.Column('target_id', sa.Integer(), nullable=True),
        sa.Column('details', sa.Text(), nullable=True),
        sa.Column('ip_address', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['admin_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_admin_audit_logs_admin_id'), 'admin_audit_logs', ['admin_id'], unique=False)
    op.create_index(op.f('ix_admin_audit_logs_id'), 'admin_audit_logs', ['id'], unique=False)

    op.create_table(
        'admin_notes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('admin_id', sa.Integer(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['admin_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_admin_notes_id'), 'admin_notes', ['id'], unique=False)
    op.create_index(op.f('ix_admin_notes_user_id'), 'admin_notes', ['user_id'], unique=False)

    op.create_table(
        'banned_words',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('word', sa.String(), nullable=False),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('word'),
    )
    op.create_index(op.f('ix_banned_words_id'), 'banned_words', ['id'], unique=False)

    op.create_table(
        'reports',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('reporter_id', sa.Integer(), nullable=False),
        sa.Column('target_type', sa.String(), nullable=False),
        sa.Column('target_id', sa.Integer(), nullable=False),
        sa.Column('reason', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.String(), nullable=True),
        sa.Column('reviewed_by', sa.Integer(), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['reporter_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['reviewed_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_reports_id'), 'reports', ['id'], unique=False)
    op.create_index(op.f('ix_reports_reporter_id'), 'reports', ['reporter_id'], unique=False)

    op.create_table(
        'user_sanctions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('admin_id', sa.Integer(), nullable=False),
        sa.Column('sanction_type', sa.String(), nullable=False),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['admin_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_user_sanctions_id'), 'user_sanctions', ['id'], unique=False)
    op.create_index(op.f('ix_user_sanctions_user_id'), 'user_sanctions', ['user_id'], unique=False)

    op.add_column('users', sa.Column('admin_role', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'admin_role')

    op.drop_index(op.f('ix_user_sanctions_user_id'), table_name='user_sanctions')
    op.drop_index(op.f('ix_user_sanctions_id'), table_name='user_sanctions')
    op.drop_table('user_sanctions')

    op.drop_index(op.f('ix_reports_reporter_id'), table_name='reports')
    op.drop_index(op.f('ix_reports_id'), table_name='reports')
    op.drop_table('reports')

    op.drop_index(op.f('ix_banned_words_id'), table_name='banned_words')
    op.drop_table('banned_words')

    op.drop_index(op.f('ix_admin_notes_user_id'), table_name='admin_notes')
    op.drop_index(op.f('ix_admin_notes_id'), table_name='admin_notes')
    op.drop_table('admin_notes')

    op.drop_index(op.f('ix_admin_audit_logs_id'), table_name='admin_audit_logs')
    op.drop_index(op.f('ix_admin_audit_logs_admin_id'), table_name='admin_audit_logs')
    op.drop_table('admin_audit_logs')

    op.drop_index(op.f('ix_daily_stats_id'), table_name='daily_stats')
    op.drop_index(op.f('ix_daily_stats_date'), table_name='daily_stats')
    op.drop_table('daily_stats')
